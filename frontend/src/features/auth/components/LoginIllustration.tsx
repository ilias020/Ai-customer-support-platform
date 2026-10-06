/**
 * Decorative illustration for the login page (Figma: Login / Desktop & Tablet).
 * Purely visual: hidden from assistive technology.
 */

function Circle({ className }: { className: string }) {
  return <span className={`absolute rounded-full bg-primary-100 ${className}`} />;
}

function ChatCaption() {
  return <p className="text-[11px] leading-[14px] text-neutral-400">◷ Opgelost in 42s</p>;
}

export function LoginIllustrationPanel() {
  return (
    <div aria-hidden="true" className="relative h-full min-h-screen overflow-hidden bg-background">
      <Circle className="-top-[140px] -right-[120px] size-[420px]" />
      <Circle className="bottom-6 -left-[140px] size-80" />

      <div className="absolute top-1/2 left-1/2 -mt-[252px] flex w-[360px] -translate-x-1/2 flex-col gap-[51px]">
        <div className="flex flex-col gap-3 rounded-xl bg-surface px-5 pt-[18px] pb-[18px] shadow-lg">
          <p className="text-[13px] leading-[17px] font-semibold text-primary-500">
            Support Bot NL
          </p>
          <p className="self-start rounded-lg bg-neutral-100 whitespace-nowrap px-3 py-2 text-xs leading-[18px] text-secondary-900">
            Hoi, mijn bestelling is niet aangekomen.
          </p>
          <p className="w-[304px] rounded-lg bg-primary-500 px-3 py-2 text-xs leading-[18px] text-white">
            Ik help je direct — ik zie bestelling #4821, verzonden gisteren.
          </p>
          <ChatCaption />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatChip label="AI-oplosgraad" value="68%" />
          <StatChip label="Reactietijd" value="42s" />
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl border border-border bg-surface px-4 pt-3">
      <p className="text-[11px] leading-[14px] text-secondary-500">{label}</p>
      <p className="text-lg leading-[23px] font-bold text-secondary-900">{value}</p>
    </div>
  );
}

export function LoginIllustrationBand() {
  return (
    <div aria-hidden="true" className="relative h-[280px] overflow-hidden bg-background">
      <Circle className="-top-[140px] -right-9 size-[300px]" />
      <Circle className="-bottom-[100px] -left-20 size-[220px]" />

      <div className="absolute top-[60px] left-1/2 flex w-[302px] -translate-x-1/2 flex-col gap-2 rounded-xl bg-surface px-[18px] pt-3.5 pb-3.5 shadow-lg">
        <p className="text-xs leading-4 font-semibold text-primary-500">Support Bot NL</p>
        <p className="rounded-lg bg-primary-500 px-3 py-2 text-xs leading-[17px] text-white">
          Ik zie bestelling #4821, verzonden gisteren.
        </p>
        <ChatCaption />
      </div>
    </div>
  );
}
