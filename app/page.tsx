import { redirect } from 'next/navigation';
import { getCurrentUser, publicUser } from '@/lib/auth';
import VideoGenerator from '@/components/VideoGenerator';

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user || user.status !== 'active') {
    redirect('/login');
  }

  return <VideoGenerator initialUser={publicUser(user)} />;
}
