import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { GraduationCap, BookOpen, Users, Award } from 'lucide-react';

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate('/dashboard');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-accent/10 py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-primary to-accent mb-4">
              <GraduationCap className="w-10 h-10 text-white" />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent">
              Uni-Course v1.0
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              A comprehensive Course Management System designed for modern educational institutions
            </p>
            <div className="flex gap-4 justify-center pt-4">
              <Button size="lg" onClick={() => navigate('/auth')} className="gap-2">
                Get Started
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/auth')}>
                Sign In
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold text-center mb-12">Everything You Need</h2>
          <div className="grid gap-8 md:grid-cols-3">
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10">
                <BookOpen className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-xl font-semibold">Course Management</h3>
              <p className="text-muted-foreground">
                Create and manage courses with ease. Track enrollments and organize content efficiently.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10">
                <Users className="w-8 h-8 text-accent" />
              </div>
              <h3 className="text-xl font-semibold">Role-Based Access</h3>
              <p className="text-muted-foreground">
                Secure authentication for students, teachers, and administrators with tailored interfaces.
              </p>
            </div>

            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-purple-500/10">
                <Award className="w-8 h-8 text-purple-500" />
              </div>
              <h3 className="text-xl font-semibold">Assignment & Grading</h3>
              <p className="text-muted-foreground">
                Streamline assignment submission, grading, and feedback with automated workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-primary/5 to-accent/5">
        <div className="container mx-auto max-w-4xl text-center space-y-6">
          <h2 className="text-3xl md:text-4xl font-bold">Ready to Transform Your Institution?</h2>
          <p className="text-lg text-muted-foreground">
            Join educators and students using Uni-Course to streamline their academic operations.
          </p>
          <Button size="lg" onClick={() => navigate('/auth')}>
            Start Free Trial
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
