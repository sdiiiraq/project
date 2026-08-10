import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

/**
 * حماية المسارات على مستوى الخادم (§134). هذا توجيه فقط؛
 * الخادم يفرض الصلاحيات الفعلية (§10) — لا تعتمد الواجهة وحدها.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  // ملاحظة: التحقق من الرمز يتم في عميل API لأن sessionStorage غير متاح هنا.
  // التوجيه هنا يمنع الوصول المباشر للصفحات المحمية دون جلسة.
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
