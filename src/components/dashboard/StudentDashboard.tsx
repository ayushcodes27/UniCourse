import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, FileText, CalendarCheck, TrendingUp, Clock, Megaphone, ChevronDown, ChevronRight, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/integrations/firebase/client';
import { uploadToAzureBlob } from '@/integrations/azure/storage';
import { collection, getDocs, query, where, doc, getDoc, onSnapshot, orderBy, addDoc, getCountFromServer, serverTimestamp } from 'firebase/firestore';
                                                                                                                                                                                                                                                                                                                                                                                    
interface Course {
  id: string;
  course_name: string;
  course_code: string;
  description: string;
}

interface Topic {
  id: string;
  course_id: string;
  title: string;
  status: 'pending'|'in-progress'|'completed';
}

interface AttendanceRecord {
  id: string;
  course_id: string;
  topic_id: string;
  student_id: string;
  status: 'present'|'absent'|'late';
  session_date: string;
}

interface Assignment {
  id: string;
  course_id: string;
  title: string;
  instructions?: string;
  due_date?: string | null;
  attachment_url?: string | null;
}

interface Submission {
  id: string;
  assignment_id: string;
  course_id: string;
  student_id: string;
  file_url: string;
}

interface Grade {
  id: string;
  submission_id: string;
  course_id: string;
  student_id: string;
  grade: string;
  feedback?: string;
}

interface Announcement {
  id: string;
  course_id: string;
  title: string;
  content: string;
  created_at: any;
}

const StudentDashboard = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [overallAttendancePct, setOverallAttendancePct] = useState<number>(0);
  const [courseAttendancePct, setCourseAttendancePct] = useState<Record<string, number>>({});
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [submittingCourseIds, setSubmittingCourseIds] = useState<Record<string, boolean>>({});
  const [enrollCode, setEnrollCode] = useState<string>("");
  const [enrolling, setEnrolling] = useState<boolean>(false);
  const [assignmentsByCourse, setAssignmentsByCourse] = useState<Record<string, Assignment[]>>({});
  const [submissionByAssignment, setSubmissionByAssignment] = useState<Record<string, Submission>>({});
  const [gradeBySubmission, setGradeBySubmission] = useState<Record<string, Grade>>({});
  const [topicsByCourse, setTopicsByCourse] = useState<Record<string, Topic[]>>({});
  const [attendanceByCourse, setAttendanceByCourse] = useState<Record<string, AttendanceRecord[]>>({});
  const [announcementsByCourse, setAnnouncementsByCourse] = useState<Record<string, Announcement[]>>({});
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<Set<string>>(new Set());
  const [expandedAttendance, setExpandedAttendance] = useState<Record<string, boolean>>({});

  const fetchEnrolledCourses = useCallback(async () => {
    if (!user) return;

    try {
      // enrollments: documents with fields { student_id, course_id }
      const enrollmentsQ = query(collection(db, 'enrollments'), where('student_id', '==', user.uid));
      const enrollmentsSnap = await getDocs(enrollmentsQ);
      const courseIds = enrollmentsSnap.docs.map((d) => d.data().course_id as string);

      const fetchedCourses: Course[] = [];
      for (const cid of courseIds) {
        const courseRef = doc(collection(db, 'courses'), cid);
        const courseSnap = await getDoc(courseRef);
        if (courseSnap.exists()) {
          const data = courseSnap.data() as Omit<Course, 'id'>;
          fetchedCourses.push({ id: courseSnap.id, ...data });
        }
      }
      setCourses(fetchedCourses);

      // Fetch attendance aggregates for overall and per course
      const allAttendanceQ = query(collection(db, 'attendance'), where('student_id', '==', user.uid));
      const allAttendanceSnap = await getDocs(allAttendanceQ);
      const totalSessions = allAttendanceSnap.docs.length;
      const presentSessions = allAttendanceSnap.docs.filter((d) => (d.data().status as string) === 'present').length;
      setOverallAttendancePct(totalSessions > 0 ? Math.round((presentSessions / totalSessions) * 100) : 0);

      const perCourse: Record<string, { total: number; present: number }> = {};
      for (const d of allAttendanceSnap.docs) {
        const cid = d.data().course_id as string;
        if (!perCourse[cid]) perCourse[cid] = { total: 0, present: 0 };
        perCourse[cid].total += 1;
        if ((d.data().status as string) === 'present') perCourse[cid].present += 1;
      }
      const pctMap: Record<string, number> = {};
      Object.keys(perCourse).forEach((cid) => {
        const rec = perCourse[cid];
        pctMap[cid] = rec.total > 0 ? Math.round((rec.present / rec.total) * 100) : 0;
      });
      setCourseAttendancePct(pctMap);
    } catch (error) {
      toast.error('Failed to load courses');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEnrolledCourses();
  }, [fetchEnrolledCourses]);

  useEffect(() => {
    if (!user) return;
    const qAtt = query(collection(db, 'attendance'), where('student_id', '==', user.uid));
    const unsub = onSnapshot(qAtt, (snap) => {
      const records: AttendanceRecord[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AttendanceRecord, 'id'>) }));
      setAttendanceByCourse((prev) => {
        const grouped: Record<string, AttendanceRecord[]> = {};
        records.forEach((r) => {
          if (!grouped[r.course_id]) grouped[r.course_id] = [];
          grouped[r.course_id].push(r);
        });
        return grouped;
      });
      
      const total = records.length;
      const present = records.filter((r) => r.status === 'present').length;
      setOverallAttendancePct(total > 0 ? Math.round((present / total) * 100) : 0);
      
      const per: Record<string, { total: number; present: number }> = {};
      records.forEach((r) => {
        if (!per[r.course_id]) per[r.course_id] = { total: 0, present: 0 };
        per[r.course_id].total += 1;
        if (r.status === 'present') per[r.course_id].present += 1;
      });
      const pct: Record<string, number> = {};
      Object.keys(per).forEach((cid) => {
        pct[cid] = per[cid].total > 0 ? Math.round((per[cid].present / per[cid].total) * 100) : 0;
      });
      setCourseAttendancePct(pct);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user || courses.length === 0) return;
    const unsubs: Array<() => void> = [];
    courses.forEach((course) => {
      const qA = query(collection(db, 'assignments'), where('course_id', '==', course.id));
      const unsubA = onSnapshot(qA, (snap) => {
        const list: Assignment[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Assignment,'id'>) }));
        setAssignmentsByCourse((prev) => ({ ...prev, [course.id]: list }));
      });
      unsubs.push(unsubA);

      const qT = query(collection(db, 'topics'), where('course_id', '==', course.id));
      const unsubT = onSnapshot(qT, (snap) => {
        const list: Topic[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Topic,'id'>) }));
        setTopicsByCourse((prev) => ({ ...prev, [course.id]: list }));
      });
      unsubs.push(unsubT);

      const qS = query(collection(db, 'assignment_submissions'), where('course_id', '==', course.id), where('student_id', '==', user.uid));
      const unsubS = onSnapshot(qS, (snap) => {
        const map: Record<string, Submission> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Submission;
          map[data.assignment_id] = { id: d.id, ...data };
        });
        setSubmissionByAssignment((prev) => ({ ...prev, ...map }));
      });
      unsubs.push(unsubS);

      const qG = query(collection(db, 'grades'), where('course_id', '==', course.id), where('student_id', '==', user.uid));
      const unsubG = onSnapshot(qG, (snap) => {
        const map: Record<string, Grade> = {};
        snap.docs.forEach((d) => {
          const data = d.data() as Grade;
          map[data.submission_id] = { id: d.id, ...data };
        });
        setGradeBySubmission((prev) => ({ ...prev, ...map }));
      });
      unsubs.push(unsubG);

      const qAnn = query(collection(db, 'announcements'), where('course_id', '==', course.id));
      const unsubAnn = onSnapshot(qAnn, (snap) => {
        console.log('Announcements listener for course', course.id, 'received', snap.docs.length, 'announcements');
        const list: Announcement[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Announcement,'id'>) }));
        console.log('Setting announcements for course', course.id, ':', list);
        setAnnouncementsByCourse((prev) => ({ ...prev, [course.id]: list }));
      });
      unsubs.push(unsubAnn);
    });
    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, courses]);

  // Real-time alerts subscription
  useEffect(() => {
    if (!user) return;
    const alertsQ = query(
      collection(db, 'alerts'),
      orderBy('created_at', 'desc'),
    );
    const unsub = onSnapshot(alertsQ, (snap) => {
      snap.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const data = change.doc.data() as { title?: string; message?: string; audience?: string; student_id?: string };
          const isForUser =
            data.audience === 'all' ||
            data.audience === 'students' ||
            data.student_id === user.uid;
          if (isForUser) {
            toast.info(data.title || 'New alert', { description: data.message });
          }
        }
      });
    });
    return () => unsub();
  }, [user]);

  const handleFileChange = (courseId: string, file: File | null) => {
    setSelectedFiles((prev) => ({ ...prev, [courseId]: file }));
  };

  const handleSubmitAssignment = async (courseId: string, assignmentId: string) => {
    const file = selectedFiles[assignmentId];
    if (!user || !file) {
      toast.error('Select a file first');
      return;
    }
    try {
      setSubmittingCourseIds((p) => ({ ...p, [assignmentId]: true }));
      console.log('Starting upload for assignment:', assignmentId);
      
      const path = `assignments/${courseId}/${assignmentId}/${user.uid}/${Date.now()}_${file.name}`;
      console.log('Upload path:', path);
      
      const url = await uploadToAzureBlob(file, path);
      console.log('Download URL obtained:', url);
      
      const submissionData = {
        course_id: courseId,
        assignment_id: assignmentId,
        student_id: user.uid,
        file_url: url,
        file_path: path,
        submitted_at: serverTimestamp(),
      };
      console.log('Submitting to Firestore:', submissionData);
      
      await addDoc(collection(db, 'assignment_submissions'), submissionData);
      console.log('Submission saved to Firestore');
      
      toast.success('Assignment submitted');
      setSelectedFiles((prev) => ({ ...prev, [assignmentId]: null }));
    } catch (error) {
      console.error('Submission error:', error);
      toast.error(`Failed to submit assignment: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setSubmittingCourseIds((p) => ({ ...p, [assignmentId]: false }));
    }
  };

  const handleEnroll = async () => {
    if (!user || !enrollCode.trim()) {
      toast.error('Enter a course code');
      return;
    }
    try {
      setEnrolling(true);
      const courseQ = query(collection(db, 'courses'), where('course_code', '==', enrollCode.trim().toUpperCase()));
      const courseSnap = await getDocs(courseQ);
      if (courseSnap.empty) {
        toast.error('Course not found');
        return;
      }
      const courseDoc = courseSnap.docs[0];
      const courseId = courseDoc.id;
      const existsQ = query(
        collection(db, 'enrollments'),
        where('student_id', '==', user.uid),
        where('course_id', '==', courseId)
      );
      const countSnap = await getCountFromServer(existsQ);
      if (countSnap.data().count > 0) {
        toast.info('Already enrolled');
        return;
      }
      await addDoc(collection(db, 'enrollments'), {
        student_id: user.uid,
        course_id: courseId,
        created_at: serverTimestamp(),
      });
      toast.success('Enrolled successfully');
      setEnrollCode("");
      await fetchEnrolledCourses();
    } catch (error) {
      console.error(error);
      toast.error('Failed to enroll');
    } finally {
      setEnrolling(false);
    }
  };

  return (
    <DashboardLayout title="Student Portal" roleColor="student-color">
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-accent/20 to-accent/5 p-8">
          <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-2">Welcome Back!</h2>
            <p className="text-muted-foreground">
              Continue your learning journey with {courses.length} active courses
            </p>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Enrolled Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courses.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Attendance</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{overallAttendancePct}%</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Announcements</CardTitle>
              <Megaphone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.values(announcementsByCourse).flat().length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overall Grade</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">-</div>
            </CardContent>
          </Card>
        </div>

        {/* Enroll in a Course */}
        <div className="grid md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <input
              className="w-full rounded-md border px-3 py-2 text-sm"
              placeholder="Enter course code (e.g., CS201)"
              value={enrollCode}
              onChange={(e) => setEnrollCode(e.target.value)}
            />
          </div>
          <Button onClick={handleEnroll} disabled={enrolling}>{enrolling ? 'Enrolling...' : 'Enroll'}</Button>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="courses" className="space-y-4">
          <TabsList>
            <TabsTrigger value="courses"><BookOpen className="w-4 h-4 mr-2" />My Courses</TabsTrigger>
            <TabsTrigger value="assignments"><FileText className="w-4 h-4 mr-2" />Pending Assignments</TabsTrigger>
            <TabsTrigger value="attendance"><CalendarCheck className="w-4 h-4 mr-2" />Attendance Records</TabsTrigger>
            <TabsTrigger value="announcements"><Megaphone className="w-4 h-4 mr-2" />Announcements</TabsTrigger>
          </TabsList>

          {/* My Courses Tab */}
          <TabsContent value="courses">
            <div>
              <h3 className="text-2xl font-bold mb-4">My Courses</h3>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                </div>
              ) : courses.length === 0 ? (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <p className="text-muted-foreground">You are not enrolled in any courses yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {courses.map((course) => (
                    <Card key={course.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between w-full">
                          <div>
                            <CardTitle className="text-lg">{course.course_name}</CardTitle>
                            <CardDescription>{course.course_code}</CardDescription>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {courseAttendancePct[course.id] ?? 0}% attendance
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {course.description || 'No description available'}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Pending Assignments Tab */}
          <TabsContent value="assignments">
            <div>
              <h3 className="text-2xl font-bold mb-4">Assignments & Grades</h3>
              {courses.length === 0 ? (
                <div className="text-muted-foreground">No courses enrolled</div>
              ) : (
                <div className="space-y-4">
                  {courses.map((course) => {
                    const courseAssignments = assignmentsByCourse[course.id] || [];
                    const pendingAssignments = courseAssignments.filter(a => !submissionByAssignment[a.id]);
                    
                    if (pendingAssignments.length === 0) return null;
                    
                    return (
                      <Card key={course.id}>
                        <CardHeader>
                          <CardTitle className="text-lg">{course.course_name}</CardTitle>
                          <CardDescription>{course.course_code}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {pendingAssignments.map((assignment) => (
                              <div key={assignment.id} className="rounded-md border p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">{assignment.title}</div>
                                  <div className="text-sm text-muted-foreground">
                                    Due: {assignment.due_date || 'No due date'}
                                  </div>
                                </div>
                                {assignment.instructions && (
                                  <div className="text-sm text-muted-foreground">{assignment.instructions}</div>
                                )}
                                {assignment.attachment_url && (
                                  <a className="text-primary underline text-sm" href={assignment.attachment_url} target="_blank" rel="noreferrer">View Attachment</a>
                                )}
                                <div className="space-y-2">
                                  <input
                                    type="file"
                                    onChange={(e) => handleFileChange(assignment.id, e.target.files?.[0] || null)}
                                  />
                                  <Button
                                    variant="outline"
                                    className="w-full"
                                    disabled={submittingCourseIds[assignment.id]}
                                    onClick={() => handleSubmitAssignment(course.id, assignment.id)}
                                  >
                                    {submittingCourseIds[assignment.id] ? 'Submitting...' : 'Submit Assignment'}
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                  {courses.every(course => {
                    const courseAssignments = assignmentsByCourse[course.id] || [];
                    const pendingAssignments = courseAssignments.filter(a => !submissionByAssignment[a.id]);
                    return pendingAssignments.length === 0;
                  }) && (
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <div className="text-muted-foreground">No pending assignments</div>
                        <div className="text-sm text-muted-foreground mt-2">All assignments have been submitted</div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Submissions with Grades */}
                  {courses.length > 0 && courses.some(course => {
                    const courseAssignments = assignmentsByCourse[course.id] || [];
                    const submittedAssignments = courseAssignments.filter(a => submissionByAssignment[a.id]);
                    return submittedAssignments.length > 0;
                  }) && (
                    <div className="mt-6">
                      <h4 className="text-xl font-semibold mb-4">Submitted Assignments</h4>
                      <div className="space-y-4">
                        {courses.map((course) => {
                          const courseAssignments = assignmentsByCourse[course.id] || [];
                          const submittedAssignments = courseAssignments.filter(a => submissionByAssignment[a.id]);
                          
                          if (submittedAssignments.length === 0) return null;
                          
                          return (
                            <Card key={`submitted-${course.id}`}>
                              <CardHeader>
                                <CardTitle className="text-lg">{course.course_name}</CardTitle>
                                <CardDescription>{course.course_code}</CardDescription>
                              </CardHeader>
                              <CardContent>
                                <div className="space-y-3">
                                  {submittedAssignments.map((assignment) => {
                                    const submission = submissionByAssignment[assignment.id];
                                    const grade = gradeBySubmission[submission?.id || ''];
                                    
                                    return (
                                      <div key={assignment.id} className="rounded-md border p-4 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <div className="font-medium">{assignment.title}</div>
                                          <div className="text-sm text-muted-foreground">
                                            Submitted
                                          </div>
                                        </div>
                                        {grade ? (
                                          <div className="bg-green-50 rounded-md p-3">
                                            <div className="flex items-center justify-between mb-1">
                                              <span className="text-sm font-medium text-green-800">Grade: {grade.grade}</span>
                                              <span className="text-xs text-green-600">✓ Graded</span>
                                            </div>
                                            {grade.feedback && (
                                              <div className="text-sm text-green-700 mt-1">
                                                <strong>Feedback:</strong> {grade.feedback}
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          <div className="text-sm text-gray-500 italic">Awaiting grade...</div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements">
            <div>
              <h3 className="text-2xl font-bold mb-4">Announcements</h3>
              {courses.length === 0 ? (
                <div className="text-muted-foreground">No courses enrolled</div>
              ) : (
                <div className="space-y-4">
                  {courses.map((course) => {
                    const courseAnnouncements = announcementsByCourse[course.id] || [];
                    const visibleAnnouncements = courseAnnouncements.filter(a => !dismissedAnnouncements.has(a.id));
                    
                    return (
                      <Card key={course.id}>
                        <CardHeader>
                          <CardTitle className="text-lg">{course.course_name}</CardTitle>
                          <CardDescription>{course.course_code}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {visibleAnnouncements.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              {courseAnnouncements.length === 0 ? 'No announcements for this course yet' : 'All announcements dismissed'}
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {visibleAnnouncements.map((announcement) => (
                                <div key={announcement.id} className="rounded-md border p-4 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="font-medium">{announcement.title}</div>
                                    <div className="flex items-center gap-2">
                                      <div className="text-xs text-muted-foreground">
                                        {announcement.created_at?.toDate ? new Date(announcement.created_at.toDate()).toLocaleDateString() : 'Recent'}
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0"
                                        onClick={() => setDismissedAnnouncements(prev => new Set([...prev, announcement.id]))}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{announcement.content}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Attendance Records Tab */}
          <TabsContent value="attendance">
            <div>
              <h3 className="text-2xl font-bold mb-4">Attendance Records</h3>
              {courses.length === 0 ? (
                <div className="text-muted-foreground">No courses enrolled</div>
              ) : (
                <div className="grid gap-4">
                  {courses.map((course) => {
                    const courseAttendance = attendanceByCourse[course.id] || [];
                    const courseTopics = topicsByCourse[course.id] || [];
                    return (
                      <Card key={course.id}>
                        <CardHeader>
                          <CardTitle className="text-lg">{course.course_name}</CardTitle>
                          <CardDescription>{course.course_code} • {courseAttendancePct[course.id] ?? 0}% attendance</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {courseAttendance.length === 0 ? (
                            <div className="text-sm text-muted-foreground">No attendance records yet</div>
                          ) : (
                            <div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mb-3"
                                onClick={() => setExpandedAttendance(prev => ({ ...prev, [course.id]: !prev[course.id] }))}
                              >
                                {expandedAttendance[course.id] ? (
                                  <><ChevronDown className="h-4 w-4 mr-2" /> Hide Details</>
                                ) : (
                                  <><ChevronRight className="h-4 w-4 mr-2" /> Show Details</>
                                )}
                              </Button>
                              {expandedAttendance[course.id] && (
                                <div className="space-y-3">
                                  {courseAttendance.map((record) => {
                                    const topic = courseTopics.find(t => t.id === record.topic_id);
                                    return (
                                      <div key={record.id} className="flex items-center justify-between rounded-md border p-3">
                                        <div>
                                          <div className="font-medium">{topic?.title || 'Unknown Topic'}</div>
                                          <div className="text-sm text-muted-foreground">{record.session_date}</div>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-xs ${
                                          record.status === 'present' ? 'bg-green-100 text-green-800' :
                                          record.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                                          'bg-red-100 text-red-800'
                                        }`}>
                                          {record.status}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default StudentDashboard;
