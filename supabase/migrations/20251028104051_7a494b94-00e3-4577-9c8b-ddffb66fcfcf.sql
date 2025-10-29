-- Create user role enum
CREATE TYPE public.app_role AS ENUM ('student', 'teacher', 'admin');

-- Create profiles table
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role app_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, role)
);

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Create courses table
CREATE TABLE public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_name TEXT NOT NULL,
    course_code TEXT NOT NULL UNIQUE,
    description TEXT,
    teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create enrollments table
CREATE TABLE public.enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, student_id)
);

-- Create assignments table
CREATE TABLE public.assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    instructions TEXT,
    due_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create submissions table
CREATE TABLE public.submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    file_url TEXT NOT NULL,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    grade NUMERIC,
    feedback TEXT,
    graded_at TIMESTAMPTZ,
    UNIQUE (assignment_id, student_id)
);

-- Create attendance table
CREATE TABLE public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    session_date DATE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (course_id, student_id, session_date)
);

-- Create announcements table
CREATE TABLE public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create resources table
CREATE TABLE public.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID REFERENCES public.courses(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for courses
CREATE POLICY "Everyone can view courses"
ON public.courses FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Teachers can create courses"
ON public.courses FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

CREATE POLICY "Teachers can update their own courses"
ON public.courses FOR UPDATE
TO authenticated
USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete their own courses"
ON public.courses FOR DELETE
TO authenticated
USING (teacher_id = auth.uid());

-- RLS Policies for enrollments
CREATE POLICY "Students can view their enrollments"
ON public.enrollments FOR SELECT
TO authenticated
USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can enroll students"
ON public.enrollments FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for assignments
CREATE POLICY "Students can view assignments for enrolled courses"
ON public.assignments FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE course_id = assignments.course_id AND student_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = assignments.course_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Teachers can create assignments for their courses"
ON public.assignments FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = course_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Teachers can update assignments for their courses"
ON public.assignments FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = assignments.course_id AND teacher_id = auth.uid()
    )
);

-- RLS Policies for submissions
CREATE POLICY "Students can view their own submissions"
ON public.submissions FOR SELECT
TO authenticated
USING (
    student_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.assignments a
        JOIN public.courses c ON a.course_id = c.id
        WHERE a.id = submissions.assignment_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Students can create their own submissions"
ON public.submissions FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid());

CREATE POLICY "Teachers can update submissions for their courses"
ON public.submissions FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.assignments a
        JOIN public.courses c ON a.course_id = c.id
        WHERE a.id = submissions.assignment_id AND c.teacher_id = auth.uid()
    )
);

-- RLS Policies for attendance
CREATE POLICY "Students can view their own attendance"
ON public.attendance FOR SELECT
TO authenticated
USING (
    student_id = auth.uid() OR
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = attendance.course_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Teachers can manage attendance for their courses"
ON public.attendance FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = attendance.course_id AND teacher_id = auth.uid()
    )
);

-- RLS Policies for announcements
CREATE POLICY "Students can view announcements for enrolled courses"
ON public.announcements FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE course_id = announcements.course_id AND student_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = announcements.course_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Teachers can create announcements for their courses"
ON public.announcements FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = course_id AND teacher_id = auth.uid()
    )
);

-- RLS Policies for resources
CREATE POLICY "Students can view resources for enrolled courses"
ON public.resources FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.enrollments
        WHERE course_id = resources.course_id AND student_id = auth.uid()
    ) OR
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = resources.course_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Teachers can upload resources for their courses"
ON public.resources FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.courses
        WHERE id = course_id AND teacher_id = auth.uid()
    )
);

-- Create storage bucket for assignment submissions
INSERT INTO storage.buckets (id, name, public)
VALUES ('assignment-submissions', 'assignment-submissions', false);

-- Storage policies for assignment submissions
CREATE POLICY "Students can upload their own submissions"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'assignment-submissions' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own submissions"
ON storage.objects FOR SELECT
TO authenticated
USING (
    bucket_id = 'assignment-submissions' AND
    auth.uid()::text = (storage.foldername(name))[1]
);

-- Create storage bucket for course resources
INSERT INTO storage.buckets (id, name, public)
VALUES ('course-resources', 'course-resources', true);

-- Storage policies for course resources
CREATE POLICY "Teachers can upload course resources"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'course-resources' AND
    public.has_role(auth.uid(), 'teacher')
);

CREATE POLICY "Everyone can view course resources"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'course-resources');

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_courses_updated_at
BEFORE UPDATE ON public.courses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at
BEFORE UPDATE ON public.assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();