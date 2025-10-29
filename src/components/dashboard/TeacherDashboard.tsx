import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import DashboardLayout from '@/layouts/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { BookOpen, Users, FileText, Plus, Megaphone, Upload, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/integrations/firebase/client';
import { uploadToAzureBlob } from '@/integrations/azure/storage';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getCountFromServer,
  addDoc,
  serverTimestamp,
  onSnapshot,
  orderBy,
  deleteDoc,
} from 'firebase/firestore';

interface Course {
  id: string;
  course_name: string;
  course_code: string;
  description: string;
  enrollment_count?: number;
}

const TeacherDashboard = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  // Create Course
  const [courseDialogOpen, setCourseDialogOpen] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseDesc, setCourseDesc] = useState("");
  const [creatingCourse, setCreatingCourse] = useState(false);

  // Topics (lectures) management
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicStatus, setNewTopicStatus] = useState<'pending'|'in-progress'|'completed'>('pending');
  const [topics, setTopics] = useState<Array<{ id: string; title: string; status: 'pending'|'in-progress'|'completed' }>>([]);

  // Assignments creation and grading
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [assignmentInstructions, setAssignmentInstructions] = useState("");
  const [assignmentDue, setAssignmentDue] = useState("");
  const [assignmentFile, setAssignmentFile] = useState<File | null>(null);
  const [submissions, setSubmissions] = useState<Array<{ id: string; course_id: string; assignment_id: string; student_id: string; file_url: string }>>([]);
  const [assignments, setAssignments] = useState<Array<{ id: string; course_id: string; title: string; instructions?: string; due_date?: string; attachment_url?: string }>>([]);
  const [gradeValue, setGradeValue] = useState<string>("");
  const [feedback, setFeedback] = useState<string>("");

  // Attendance
  const [attendanceDate, setAttendanceDate] = useState<string>("");
  const [selectedTopicId, setSelectedTopicId] = useState<string>("");
  const [enrolledStudents, setEnrolledStudents] = useState<string[]>([]);
  const [attendanceMarks, setAttendanceMarks] = useState<Record<string, 'present'|'absent'>>({});

  // Announcements
  const [announceTitle, setAnnounceTitle] = useState("");
  const [announceContent, setAnnounceContent] = useState("");

  // Resources
  const [resourceFile, setResourceFile] = useState<File | null>(null);
  const [resourceTags, setResourceTags] = useState<string>("");
  const [resourceQuery, setResourceQuery] = useState<string>("");
  const [resourceType, setResourceType] = useState<string>("");
  const [resources, setResources] = useState<Array<{ id: string; name: string; url: string; tags: string[]; type: string }>>([]);

  // Student names cache
  const [studentNames, setStudentNames] = useState<Record<string, string>>({});

  const fetchTeacherCourses = useCallback(async () => {
    if (!user) return;

    try {
      // courses: documents with field { teacher_id }
      const coursesQ = query(collection(db, 'courses'), where('teacher_id', '==', user.uid));
      const coursesSnap = await getDocs(coursesQ);
      const baseCourses: Course[] = coursesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }));

      // enrollment counts via count aggregation
      const withCounts: Course[] = [];
      for (const c of baseCourses) {
        const enrollQ = query(collection(db, 'enrollments'), where('course_id', '==', c.id));
        const countSnap = await getCountFromServer(enrollQ);
        withCounts.push({ ...c, enrollment_count: countSnap.data().count });
      }

      setCourses(withCounts);
      if (!selectedCourseId && withCounts.length > 0) {
        setSelectedCourseId(withCounts[0].id);
      }
    } catch (error) {
      toast.error('Failed to load courses');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createCourse = async () => {
    if (!user || !courseName.trim() || !courseCode.trim()) {
      toast.error('Course name and code are required');
      return;
    }
    try {
      setCreatingCourse(true);
      await addDoc(collection(db, 'courses'), {
        teacher_id: user.uid,
        course_name: courseName.trim(),
        course_code: courseCode.trim(),
        description: courseDesc.trim(),
        created_at: serverTimestamp(),
      });
      setCourseName("");
      setCourseCode("");
      setCourseDesc("");
      setCourseDialogOpen(false);
      toast.success('Course created');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create course');
    } finally {
      setCreatingCourse(false);
    }
  };

  useEffect(() => {
    fetchTeacherCourses();
  }, [fetchTeacherCourses]);

  // Real-time course updates
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'courses'), where('teacher_id', '==', user.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const baseCourses: Course[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) }));
      
      // Get enrollment counts
      const withCounts: Course[] = [];
      for (const c of baseCourses) {
        const enrollQ = query(collection(db, 'enrollments'), where('course_id', '==', c.id));
        const countSnap = await getCountFromServer(enrollQ);
        withCounts.push({ ...c, enrollment_count: countSnap.data().count });
      }
      
      setCourses(withCounts);
      if (!selectedCourseId && withCounts.length > 0) {
        setSelectedCourseId(withCounts[0].id);
      }
    });
    return () => unsub();
  }, [user, selectedCourseId]);

  // Load topics when course changes
  useEffect(() => {
    if (!selectedCourseId) return;
    console.log('Setting up topics listener for course:', selectedCourseId);
    const q = query(collection(db, 'topics'), where('course_id', '==', selectedCourseId));
    const unsub = onSnapshot(q, (snap) => {
      console.log('Topics listener triggered, received', snap.docs.length, 'topics');
      type TopicDoc = { title: string; status: 'pending'|'in-progress'|'completed'; course_id: string };
      const topicsList = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TopicDoc) }));
      console.log('Setting topics:', topicsList);
      setTopics(topicsList);
    });
    return () => unsub();
  }, [selectedCourseId]);

  // Load assignments for selected course
  useEffect(() => {
    if (!selectedCourseId) return;
    const q = query(collection(db, 'assignments'), where('course_id', '==', selectedCourseId));
    const unsub = onSnapshot(q, (snap) => {
      type AssignmentDoc = { course_id: string; title: string; instructions?: string; due_date?: string; attachment_url?: string };
      setAssignments(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AssignmentDoc) })));
    });
    return () => unsub();
  }, [selectedCourseId]);

  // Load submissions for teacher's courses
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'assignment_submissions'));
    const unsub = onSnapshot(q, async (snap) => {
      type SubmissionDoc = { course_id: string; assignment_id: string; student_id: string; file_url: string };
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as SubmissionDoc) }));
      const filtered = list.filter((s) => courses.some((c) => c.id === s.course_id));
      setSubmissions(filtered);
      
      // Fetch student names for all unique student IDs
      const studentIds = [...new Set(filtered.map(s => s.student_id))];
      const names: Record<string, string> = {};
      
      for (const studentId of studentIds) {
        try {
          const profileDoc = await getDoc(doc(collection(db, 'profiles'), studentId));
          if (profileDoc.exists()) {
            const data = profileDoc.data();
            names[studentId] = data.full_name || studentId;
          } else {
            names[studentId] = studentId;
          }
        } catch (error) {
          console.error('Error fetching profile for', studentId, error);
          names[studentId] = studentId;
        }
      }
      
      setStudentNames(prev => ({ ...prev, ...names }));
    });
    return () => unsub();
  }, [user, courses]);

  // Load resources for selected course
  useEffect(() => {
    if (!selectedCourseId) return;
    const q = query(collection(db, 'resources'), where('course_id', '==', selectedCourseId));
    const unsub = onSnapshot(q, (snap) => {
      type ResourceDoc = { name: string; url: string; tags: string[]; type: string; course_id: string };
      setResources(snap.docs.map((d) => ({ id: d.id, ...(d.data() as ResourceDoc) })));
    });
    return () => unsub();
  }, [selectedCourseId]);

  // Load announcements for selected course
  useEffect(() => {
    if (!selectedCourseId) return;
    const q = query(collection(db, 'announcements'), where('course_id', '==', selectedCourseId));
    const unsub = onSnapshot(q, (snap) => {
      type AnnouncementDoc = { course_id: string; title: string; content: string; created_at: any };
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...(d.data() as AnnouncementDoc) })));
    });
    return () => unsub();
  }, [selectedCourseId]);

  const filteredResources = useMemo(() => {
    const q = resourceQuery.trim().toLowerCase();
    const type = resourceType.trim().toLowerCase();
    return resources.filter((r) => {
      const nameMatch = !q || r.name.toLowerCase().includes(q) || r.tags.some((t) => t.toLowerCase().includes(q));
      const typeMatch = !type || r.type.toLowerCase().includes(type);
      return nameMatch && typeMatch;
    });
  }, [resources, resourceQuery, resourceType]);

  const createTopic = async () => {
    if (!user || !selectedCourseId || !newTopicTitle.trim()) {
      toast.error('Provide course and topic title');
      return;
    }
    try {
      console.log('Creating topic:', { selectedCourseId, title: newTopicTitle.trim(), status: newTopicStatus });
      await addDoc(collection(db, 'topics'), {
        course_id: selectedCourseId,
        title: newTopicTitle.trim(),
        status: newTopicStatus,
        created_at: serverTimestamp(),
      });
      console.log('Topic created successfully');
      setNewTopicTitle("");
      setNewTopicStatus('pending');
      toast.success('Topic added');
    } catch (e) {
      console.error('Error creating topic:', e);
      toast.error('Failed to add topic');
    }
  };

  const deleteTopic = async (topicId: string) => {
    if (!topicId) return;
    try {
      await deleteDoc(doc(db, 'topics', topicId));
      toast.success('Topic deleted');
    } catch (e) {
      console.error('Error deleting topic:', e);
      toast.error('Failed to delete topic');
    }
  };

  const createAssignment = async () => {
    if (!user || !selectedCourseId || !assignmentTitle.trim()) {
      toast.error('Fill required fields');
      return;
    }
    try {
      let attachmentUrl: string | null = null;
      if (assignmentFile) {
        const path = `assignments_meta/${selectedCourseId}/${Date.now()}_${assignmentFile.name}`;
        attachmentUrl = await uploadToAzureBlob(assignmentFile, path);
      }
      await addDoc(collection(db, 'assignments'), {
        course_id: selectedCourseId,
        teacher_id: user.uid,
        title: assignmentTitle.trim(),
        instructions: assignmentInstructions.trim(),
        due_date: assignmentDue || null,
        attachment_url: attachmentUrl,
        created_at: serverTimestamp(),
      });
      setAssignmentTitle("");
      setAssignmentInstructions("");
      setAssignmentDue("");
      setAssignmentFile(null);
      toast.success('Assignment created');
    } catch (e) {
      console.error(e);
      toast.error('Failed to create assignment');
    }
  };

  const gradeSubmission = async (submissionId: string, studentId: string) => {
    if (!selectedCourseId || !gradeValue.trim()) {
      toast.error('Enter a grade');
      return;
    }
    try {
      await addDoc(collection(db, 'grades'), {
        submission_id: submissionId,
        course_id: selectedCourseId,
        student_id: studentId,
        grade: gradeValue,
        feedback: feedback,
        created_at: serverTimestamp(),
      });
      setGradeValue("");
      setFeedback("");
      toast.success('Grade saved');
    } catch (e) {
      console.error(e);
      toast.error('Failed to save grade');
    }
  };

  const loadEnrolledStudents = useCallback(async () => {
    if (!selectedCourseId) return;
    const q = query(collection(db, 'enrollments'), where('course_id', '==', selectedCourseId));
    const snap = await getDocs(q);
    const ids = snap.docs.map((d) => d.data().student_id as string);
    
    // Fetch student names
    const names: Record<string, string> = {};
    for (const studentId of ids) {
      try {
        const profileDoc = await getDoc(doc(collection(db, 'profiles'), studentId));
        if (profileDoc.exists()) {
          const data = profileDoc.data();
          names[studentId] = data.full_name || studentId;
        } else {
          names[studentId] = studentId;
        }
      } catch (error) {
        console.error('Error fetching profile for', studentId, error);
        names[studentId] = studentId;
      }
    }
    
    setEnrolledStudents(ids);
    setStudentNames(prev => ({ ...prev, ...names }));
    setAttendanceMarks((prev) => {
      const next: Record<string, 'present'|'absent'> = { ...prev };
      ids.forEach((id) => { if (!next[id]) next[id] = 'present'; });
      return next;
    });
  }, [selectedCourseId]);

  useEffect(() => {
    loadEnrolledStudents();
  }, [loadEnrolledStudents]);

  const saveAttendance = async () => {
    if (!selectedCourseId || !attendanceDate || !selectedTopicId) {
      toast.error('Choose course, date, and lecture');
      return;
    }
    try {
      const writes = enrolledStudents.map((sid) => addDoc(collection(db, 'attendance'), {
        course_id: selectedCourseId,
        topic_id: selectedTopicId,
        student_id: sid,
        status: attendanceMarks[sid] || 'present',
        session_date: attendanceDate,
        created_at: serverTimestamp(),
      }));
      await Promise.all(writes);
      toast.success('Attendance recorded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to record attendance');
    }
  };

  const exportAttendanceCSV = async () => {
    if (!selectedCourseId) return;
    const q = query(collection(db, 'attendance'), where('course_id', '==', selectedCourseId));
    const snap = await getDocs(q);
    type AttendanceRow = { student_id: string; session_date?: string; status: string };
    const rows = snap.docs.map((d) => d.data() as AttendanceRow);
    const header = ['student_id', 'session_date', 'status'];
    const csv = [header.join(','), ...rows.map((r) => [r.student_id, r.session_date || '', r.status].join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${selectedCourseId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const postAnnouncement = async () => {
    if (!selectedCourseId || !announceTitle.trim()) {
      toast.error('Provide title');
      return;
    }
    try {
      console.log('Posting announcement to course:', selectedCourseId);
      await addDoc(collection(db, 'announcements'), {
        course_id: selectedCourseId,
        title: announceTitle.trim(),
        content: announceContent.trim(),
        created_at: serverTimestamp(),
      });
      console.log('Announcement posted successfully');
      setAnnounceTitle("");
      setAnnounceContent("");
      toast.success('Announcement posted');
    } catch (e) {
      console.error('Error posting announcement:', e);
      toast.error('Failed to post announcement');
    }
  };

  const uploadResource = async () => {
    if (!selectedCourseId || !resourceFile) {
      toast.error('Pick a file');
      return;
    }
    try {
      const path = `resources/${selectedCourseId}/${Date.now()}_${resourceFile.name}`;
      const url = await uploadToAzureBlob(resourceFile, path);
      const tags = resourceTags.split(',').map((t) => t.trim()).filter(Boolean);
      const type = resourceFile.name.split('.').pop()?.toLowerCase() || '';
      await addDoc(collection(db, 'resources'), {
        course_id: selectedCourseId,
        name: resourceFile.name,
        url,
        tags,
        type,
        created_at: serverTimestamp(),
      });
      setResourceFile(null);
      setResourceTags("");
      toast.success('Resource uploaded');
    } catch (e) {
      console.error(e);
      toast.error('Failed to upload');
    }
  };

  return (
    <DashboardLayout title="Teacher Portal" roleColor="teacher-color">
      <div className="space-y-8">
        {/* Welcome Section */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 p-8">
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">Welcome Back, Teacher!</h2>
              <p className="text-muted-foreground">
                Manage your {courses.length} active courses
              </p>
            </div>
            <Button size="lg" className="gap-2" onClick={() => setCourseDialogOpen(true)}>
              <Plus className="w-5 h-5" />
              Create Course
            </Button>
          </div>
        </div>

        <Dialog open={courseDialogOpen} onOpenChange={setCourseDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Course</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Name</Label>
                <Input value={courseName} onChange={(e) => setCourseName(e.target.value)} placeholder="e.g., Data Structures" />
              </div>
              <div>
                <Label>Code</Label>
                <Input value={courseCode} onChange={(e) => setCourseCode(e.target.value)} placeholder="e.g., CS201" />
              </div>
              <div>
                <Label>Description</Label>
                <Input value={courseDesc} onChange={(e) => setCourseDesc(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCourseDialogOpen(false)}>Cancel</Button>
              <Button onClick={createCourse} disabled={creatingCourse}>{creatingCourse ? 'Creating...' : 'Create'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Quick Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{courses.length}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Students</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {courses.reduce((sum, course) => sum + (course.enrollment_count || 0), 0)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Grades</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
            </CardContent>
          </Card>
        </div>

        {/* Course Management & Tools */}
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-72">
              <Label>Selected Course</Label>
              <Select value={selectedCourseId ?? ''} onValueChange={(v) => setSelectedCourseId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a course" />
                </SelectTrigger>
                <SelectContent>
                  {courses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.course_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="topics" className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="topics"><ListChecks className="w-4 h-4 mr-2" />Topics</TabsTrigger>
              <TabsTrigger value="attendance"><Users className="w-4 h-4 mr-2" />Attendance</TabsTrigger>
              <TabsTrigger value="assignments"><FileText className="w-4 h-4 mr-2" />Assignments</TabsTrigger>
              <TabsTrigger value="announcements"><Megaphone className="w-4 h-4 mr-2" />Announcements</TabsTrigger>
              <TabsTrigger value="resources"><Upload className="w-4 h-4 mr-2" />Resources</TabsTrigger>
            </TabsList>

            {/* Topics */}
            <TabsContent value="topics">
              <Card>
                <CardHeader>
                  <CardTitle>Lectures / Topics</CardTitle>
                  <CardDescription>Create and track topic status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label>Title</Label>
                      <Input value={newTopicTitle} onChange={(e) => setNewTopicTitle(e.target.value)} placeholder="e.g., Introduction to Algorithms" />
                    </div>
                    <div className="w-48">
                      <Label>Status</Label>
                      <Select value={newTopicStatus} onValueChange={(v) => setNewTopicStatus(v as 'pending'|'in-progress'|'completed')}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="in-progress">In Progress</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={createTopic}><Plus className="w-4 h-4 mr-2" />Add</Button>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="font-medium">Lecture List</div>
                    <div className="grid gap-3">
                      {topics.map((t) => (
                        <div key={t.id} className="flex items-center justify-between rounded-md border p-4">
                          <div className="flex-1">
                            <div className="font-medium">{t.title}</div>
                            <div className="text-sm text-muted-foreground">Status: {t.status}</div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`px-2 py-1 rounded text-xs ${
                              t.status === 'completed' ? 'bg-green-100 text-green-800' :
                              t.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {t.status}
                            </div>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => deleteTopic(t.id)}
                              className="text-red-600 hover:text-red-700"
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                      {topics.length === 0 && <div className="text-sm text-muted-foreground">No lectures created yet.</div>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Attendance */}
            <TabsContent value="attendance">
              <Card>
                <CardHeader>
                  <CardTitle>Lecture-wise Attendance Tracking</CardTitle>
                  <CardDescription>Mark attendance for specific lectures and sessions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-3 gap-3">
                    <div>
                      <Label>Date</Label>
                      <Input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} />
                    </div>
                    <div>
                      <Label>Lecture/Topic</Label>
                      <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                        <SelectTrigger><SelectValue placeholder="Select lecture" /></SelectTrigger>
                        <SelectContent>
                          {topics.map((topic) => (
                            <SelectItem key={topic.id} value={topic.id}>{topic.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-end gap-2">
                      <Button variant="outline" onClick={loadEnrolledStudents}>Load Students</Button>
                      <Button onClick={saveAttendance}>Save Attendance</Button>
                      <Button variant="outline" onClick={exportAttendanceCSV}>Export CSV</Button>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {enrolledStudents.map((sid) => (
                      <div key={sid} className="flex items-center justify-between rounded-md border p-3">
                        <div className="text-sm font-medium">{studentNames[sid] || sid}</div>
                        <div className="flex items-center gap-2">
                          <Button variant={attendanceMarks[sid] === 'present' ? 'default' : 'outline'} onClick={() => setAttendanceMarks((p) => ({ ...p, [sid]: 'present' }))}>Present</Button>
                          <Button variant={attendanceMarks[sid] === 'absent' ? 'default' : 'outline'} onClick={() => setAttendanceMarks((p) => ({ ...p, [sid]: 'absent' }))}>Absent</Button>
                        </div>
                      </div>
                    ))}
                    {enrolledStudents.length === 0 && <div className="text-sm text-muted-foreground">No students loaded.</div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Assignments */}
            <TabsContent value="assignments">
              <Card>
                <CardHeader>
                  <CardTitle>Assignment Management</CardTitle>
                  <CardDescription>Create assignments and grade submissions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <div className="grid md:grid-cols-3 gap-3">
                      <div>
                        <Label>Title</Label>
                        <Input value={assignmentTitle} onChange={(e) => setAssignmentTitle(e.target.value)} />
                      </div>
                      <div>
                        <Label>Due Date</Label>
                        <Input type="date" value={assignmentDue} onChange={(e) => setAssignmentDue(e.target.value)} />
                      </div>
                      <div>
                        <Label>Attachment (optional)</Label>
                        <Input type="file" onChange={(e) => setAssignmentFile(e.target.files?.[0] || null)} />
                      </div>
                    </div>
                    <div>
                      <Label>Instructions</Label>
                      <Input value={assignmentInstructions} onChange={(e) => setAssignmentInstructions(e.target.value)} placeholder="Short instructions or link" />
                    </div>
                    <Button onClick={createAssignment}><Plus className="w-4 h-4 mr-2" />Create Assignment</Button>
                  </div>

                  <div className="space-y-4">
                    <div className="font-medium">Assignments & Submissions</div>
                    {assignments.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No assignments created yet.</div>
                    ) : (
                      assignments.map((assignment) => {
                        const assignmentSubmissions = submissions.filter(s => s.assignment_id === assignment.id);
                        return (
                          <div key={assignment.id} className="rounded-md border p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium">{assignment.title}</div>
                                <div className="text-sm text-muted-foreground">
                                  Due: {assignment.due_date || 'No due date'} • {assignmentSubmissions.length} submissions
                                </div>
                                {assignment.instructions && (
                                  <div className="text-sm text-muted-foreground mt-1">{assignment.instructions}</div>
                                )}
                                {assignment.attachment_url && (
                                  <a className="text-primary underline text-sm" href={assignment.attachment_url} target="_blank" rel="noreferrer">View Attachment</a>
                                )}
                              </div>
                            </div>
                            
                            {assignmentSubmissions.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-sm font-medium">Submissions:</div>
                                {assignmentSubmissions.map((submission) => (
                                  <div key={submission.id} className="rounded-md border p-3 flex items-center justify-between">
                                    <div className="text-sm">
                                      <div>Student: {studentNames[submission.student_id] || submission.student_id}</div>
                                      <a className="text-primary underline" href={submission.file_url} target="_blank" rel="noreferrer">Download Submission</a>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Input className="w-24" placeholder="Grade" value={gradeValue} onChange={(e) => setGradeValue(e.target.value)} />
                                      <Input className="w-64" placeholder="Feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
                                      <Button onClick={() => gradeSubmission(submission.id, submission.student_id)}>Save Grade</Button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Announcements */}
            <TabsContent value="announcements">
              <Card>
                <CardHeader>
                  <CardTitle>Announcements & Notifications</CardTitle>
                  <CardDescription>Post announcements; students receive in-app alerts</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label>Title</Label>
                    <Input value={announceTitle} onChange={(e) => setAnnounceTitle(e.target.value)} />
                  </div>
                  <div>
                    <Label>Content</Label>
                    <Input value={announceContent} onChange={(e) => setAnnounceContent(e.target.value)} />
                  </div>
                  <Button onClick={postAnnouncement}><Megaphone className="w-4 h-4 mr-2" />Post</Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Resources */}
            <TabsContent value="resources">
              <Card>
                <CardHeader>
                  <CardTitle>Learning Resource Library</CardTitle>
                  <CardDescription>Upload, tag, and search resources</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid md:grid-cols-4 gap-3">
                    <div className="md:col-span-2">
                      <Label>File</Label>
                      <Input type="file" onChange={(e) => setResourceFile(e.target.files?.[0] || null)} />
                    </div>
                    <div>
                      <Label>Tags (comma separated)</Label>
                      <Input value={resourceTags} onChange={(e) => setResourceTags(e.target.value)} />
                    </div>
                    <div className="flex items-end">
                      <Button onClick={uploadResource}><Upload className="w-4 h-4 mr-2" />Upload</Button>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Label>Search</Label>
                      <Input placeholder="name or tag" value={resourceQuery} onChange={(e) => setResourceQuery(e.target.value)} />
                    </div>
                    <div>
                      <Label>Type (pdf, docx, pptx)</Label>
                      <Input placeholder="e.g., pdf" value={resourceType} onChange={(e) => setResourceType(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    {filteredResources.map((r) => (
                      <div key={r.id} className="rounded-md border p-3 flex items-center justify-between">
                        <div>
                          <div className="font-medium">{r.name}</div>
                          <div className="text-xs text-muted-foreground">{r.tags.join(', ')} • {r.type}</div>
                        </div>
                        <a className="text-primary underline" href={r.url} target="_blank" rel="noreferrer">Open</a>
                      </div>
                    ))}
                    {filteredResources.length === 0 && <div className="text-sm text-muted-foreground">No resources match.</div>}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TeacherDashboard;
