import { NextResponse, type NextRequest } from 'next/server';

const COOKIE = 'pdd_admin';

// Backpack CheckIfAdmin: guests are redirected to the login page (redirect()->guest()).
export function proxy(req: NextRequest) {
  if (!req.cookies.get(COOKIE)?.value) {
    const url = req.nextUrl.clone();
    url.pathname = '/pocketddadmin/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/pocketddadmin/((?!login).*)', '/pocketddadmin'],
};
