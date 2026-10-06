import type { Metadata } from 'next';

import { LoginForm } from '../../features/auth/components/LoginForm';
import {
  LoginIllustrationBand,
  LoginIllustrationPanel,
} from '../../features/auth/components/LoginIllustration';

export const metadata: Metadata = {
  title: 'Inloggen — Nimbus',
};

/*
 * Responsive layout (Figma: Login / Mobile 390, Tablet 1024, Desktop 1440):
 * - Mobile  (< 768px):     form only.
 * - Tablet  (768–1279px):  illustration band above a centered 336px form.
 * - Desktop (>= 1280px):   50/50 split, 520px form left, illustration panel right.
 */
export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface xl:grid xl:grid-cols-2">
      <div className="hidden md:block xl:hidden">
        <LoginIllustrationBand />
      </div>

      <main className="flex flex-1 justify-center px-4 pt-10 pb-10 md:px-6 md:pt-12 md:pb-12 xl:items-center xl:px-0 xl:py-12">
        <div className="w-full md:w-[336px] xl:w-[520px]">
          <LoginForm />
        </div>
      </main>

      <div className="hidden xl:block">
        <LoginIllustrationPanel />
      </div>
    </div>
  );
}
