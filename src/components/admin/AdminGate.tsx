import { login, resetAdminPassword, setupAdmin } from "@/lib/actions";
import { getT } from "@/lib/lang";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, Section } from "@/components/ui";
import { AdminBanner } from "./shared";

type Msg = { tone: "error" | "ok"; text: string } | null;

/** First run: no admin password yet. */
export async function AdminSetup({ msg }: { msg: Msg }) {
  const { t } = await getT();
  const a = t.admin;
  return (
    <div className="max-w-md mx-auto">
      <PageHeader eyebrow={a.setup.eyebrow} title={a.setup.title} subtitle={<span>{a.setup.subtitle}</span>} />
      <Section title={a.setup.choose}>
        <form action={setupAdmin} className="flex flex-col gap-3">
          <AdminBanner msg={msg} />
          <div>
            <label htmlFor="f-setup-password" className="label">{a.setup.password}</label>
            <input id="f-setup-password" name="password" type="password" required minLength={4} className="w-full" autoFocus autoComplete="new-password" />
          </div>
          <div>
            <label htmlFor="f-setup-repeat" className="label">{a.setup.repeat}</label>
            <input id="f-setup-repeat" name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
          </div>
          <p className="text-xs text-muted">
            {a.setup.stored} <code className="font-mono">data/db.json</code>. {a.setup.nothingLeaves}
          </p>
          <SubmitButton pendingText={t.common.saving}>{a.setup.submit}</SubmitButton>
        </form>
      </Section>
    </div>
  );
}

/** `/admin?recover=1`: a new admin password with the ADMIN_RESET_TOKEN. */
export async function AdminRecover({ msg }: { msg: Msg }) {
  const { t } = await getT();
  const a = t.admin;
  const recoveryOn = !!process.env.ADMIN_RESET_TOKEN?.trim();
  return (
    <div className="max-w-md mx-auto">
      <PageHeader eyebrow={a.signIn.eyebrow} title={a.recover.title} />
      <Section title={a.recover.token}>
        <div className="flex flex-col gap-3">
          <AdminBanner msg={msg} />
          <p className="text-xs text-muted">{a.recover.hint}</p>
          {recoveryOn ? (
            <form action={resetAdminPassword} className="flex flex-col gap-3">
              <div>
                <label htmlFor="f-recover-token" className="label">{a.recover.token}</label>
                <input id="f-recover-token" name="token" type="password" required className="w-full font-mono" autoFocus autoComplete="off" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="f-recover-password" className="label">{a.recover.password}</label>
                  <input id="f-recover-password" name="password" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
                <div>
                  <label htmlFor="f-recover-repeat" className="label">{a.recover.repeat}</label>
                  <input id="f-recover-repeat" name="confirm" type="password" required minLength={4} className="w-full" autoComplete="new-password" />
                </div>
              </div>
              <SubmitButton pendingText={t.common.saving}>{a.recover.submit}</SubmitButton>
            </form>
          ) : (
            <p className="text-sm text-loss">{a.recover.off}</p>
          )}
          <a href="/admin" className="text-xs text-muted underline self-start">
            {a.recover.back}
          </a>
        </div>
      </Section>
    </div>
  );
}

/** The admin password prompt; `next` is the already-sanitised path to return to. */
export async function AdminSignIn({ msg, next }: { msg: Msg; next: string }) {
  const { t } = await getT();
  const a = t.admin;
  return (
    <div className="max-w-sm mx-auto">
      <PageHeader eyebrow={a.signIn.eyebrow} title={a.signIn.title} />
      <Section title={a.signIn.password}>
        <form action={login} className="flex flex-col gap-3">
          <AdminBanner msg={msg} />
          <input type="hidden" name="next" value={next} />
          <label htmlFor="f-signin-password" className="sr-only">
            {a.signIn.placeholder}
          </label>
          <input id="f-signin-password" name="password" type="password" required className="w-full" autoFocus autoComplete="current-password" placeholder={a.signIn.placeholder} />
          <SubmitButton pendingText={a.signIn.checking}>{a.signIn.submit}</SubmitButton>
          <a href="/admin?recover=1" className="text-xs text-muted underline self-start">
            {a.recover.link}
          </a>
        </form>
      </Section>
    </div>
  );
}
