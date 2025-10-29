import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import StudentDashboard from '@/components/dashboard/StudentDashboard';
import TeacherDashboard from '@/components/dashboard/TeacherDashboard';
import AdminDashboard from '@/components/dashboard/AdminDashboard';

const Dashboard = () => {
  const { user, userRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <>
      {userRole === 'student' && <StudentDashboard />}
      {userRole === 'teacher' && <TeacherDashboard />}
      {userRole === 'admin' && <AdminDashboard />}
    </>
  );
};

export default Dashboard;
