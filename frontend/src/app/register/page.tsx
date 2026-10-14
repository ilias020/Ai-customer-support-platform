import type { Metadata } from 'next';
import { RegisterForm } from '../../features/auth/components/RegisterForm';
import {
  LoginIllustrationBand,
  LoginIllustrationPanel,
} from '../../features/auth/components/LoginIllustration';

export const metadata: Metadata = {
  title: 'Account aanmaken — Nimbus',
};

/*
 * Public registration page (Issue #11). There is no separate Figma design: the layout follows the
 * login page (Mobile 390, Tablet 1024, Desktop 1440) with the same illustration and components.
 */
export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col bg-surface xl:grid xl:grid-cols-2">
      <div className="hidden md:block xl:hidden">
        <LoginIllustrationBand />
      </div>

      <main className="flex flex-1 justify-center px-4 pt-10 pb-10 md:px-6 md:pt-12 md:pb-12 xl:items-center xl:px-0 xl:py-12">
        <div className="w-full md:w-[448px] xl:w-[520px]">
          <RegisterForm />
        </div>
      </main>

      <div className="hidden xl:block">
        <LoginIllustrationPanel />
      </div>
    </div>
  );
}
