import { redirect } from 'next/navigation';

// routes/web.php: Route::get('/', fn () => redirect('/pocketddadmin'))
export default function Root() {
  redirect('/pocketddadmin');
}
