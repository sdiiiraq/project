import { redirect } from 'next/navigation';

export default function Home() {
  // التوجيه يتم عبر middleware وعميل المصادقة
  redirect('/login');
}
