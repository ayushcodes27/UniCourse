import { useEffect, useState } from 'react';
import { auth, db } from '@/integrations/firebase/client';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut, createUserWithEmailAndPassword, updateProfile, User } from 'firebase/auth';
import { collection, doc, getDoc, setDoc } from 'firebase/firestore';

export type UserRole = 'student' | 'teacher' | 'admin';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        await fetchUserRole(fbUser.uid);
      } else {
        setUserRole(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const fetchUserRole = async (userId: string) => {
    try {
      const roleDoc = await getDoc(doc(collection(db, 'user_roles'), userId));
      if (roleDoc.exists()) {
        const data = roleDoc.data() as { role?: UserRole };
        setUserRole(data.role ?? null);
      } else {
        setUserRole(null);
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: UserRole) => {
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (!cred.user) return { error: new Error('User creation failed') };

      await updateProfile(cred.user, { displayName: fullName });

      await setDoc(doc(collection(db, 'profiles'), cred.user.uid), {
        id: cred.user.uid,
        full_name: fullName,
        email: email,
      });

      await setDoc(doc(collection(db, 'user_roles'), cred.user.uid), {
        user_id: cred.user.uid,
        role,
      });

      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      await fbSignOut(auth);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  return {
    user,
    session: null,
    userRole,
    loading,
    signIn,
    signUp,
    signOut,
  };
};
