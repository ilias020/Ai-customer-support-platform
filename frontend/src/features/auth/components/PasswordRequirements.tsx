import { type PasswordRequirement, unmetPasswordRequirements } from '../passwordPolicy';

type RequirementRow = {
  key: string;
  label: string;
  covers: PasswordRequirement[];
};

/** The Nimbus Password Policy v1.0, as shown to the user (minimum and maximum length combined). */
const REQUIREMENT_ROWS: RequirementRow[] = [
  { key: 'length', label: '12 tot 128 tekens', covers: ['minLength', 'maxLength'] },
  { key: 'uppercase', label: 'Een hoofdletter (A–Z)', covers: ['uppercase'] },
  { key: 'lowercase', label: 'Een kleine letter (a–z)', covers: ['lowercase'] },
  { key: 'digit', label: 'Een cijfer (0–9)', covers: ['digit'] },
  { key: 'special', label: 'Een speciaal teken, zoals ! @ # of €', covers: ['special'] },
];

export const PASSWORD_REQUIREMENTS_MET = 'Je wachtwoord voldoet aan alle voorwaarden.';

/**
 * Live password requirements for registration (not for login). Uses the same rules as the
 * submit validation (`passwordPolicy.ts`), so the checklist and the form can never disagree.
 *
 * Each row only changes colour and icon while typing, so the layout does not jump per keystroke.
 * Screen readers get the state of every row via `aria-describedby` and a polite announcement
 * when all requirements are met, instead of an announcement on every keystroke.
 */
export function PasswordRequirements({ id, password }: { id: string; password: string }) {
  const unmet = unmetPasswordRequirements(password);
  const allMet = unmet.length === 0;

  return (
    <div id={id} className="flex flex-col gap-1 text-xs leading-[1.4]">
      <p aria-live="polite" className="sr-only">
        {allMet ? PASSWORD_REQUIREMENTS_MET : ''}
      </p>

      {allMet ? (
        <p className="flex items-center gap-1.5 font-medium text-success-500">
          <span aria-hidden="true">✓</span>
          {PASSWORD_REQUIREMENTS_MET}
        </p>
      ) : (
        <>
          <p className="text-secondary-500">Je wachtwoord moet bevatten:</p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-0.5 md:grid-cols-2">
            {REQUIREMENT_ROWS.map((row) => {
              const met = row.covers.every((requirement) => !unmet.includes(requirement));
              return (
                <li
                  key={row.key}
                  data-met={met}
                  className={`flex items-center gap-1.5 ${met ? 'text-success-500' : 'text-secondary-500'}`}
                >
                  <span aria-hidden="true" className="inline-block w-3 text-center">
                    {met ? '✓' : '○'}
                  </span>
                  <span>
                    {row.label}
                    <span className="sr-only">{met ? ' (voldaan)' : ' (nog niet voldaan)'}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
