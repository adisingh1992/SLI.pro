import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { AppShell, OfflineBanner } from "@/components/wing/AppShell";
import { ExploreOverlay } from "@/components/wing/ExploreOverlay";
import { useWingNav } from "@/lib/use-wing-nav";
import { apiRequest } from "@/lib/queryClient";
import { deleteDocument, listDocuments, listThreads, type WingDoc } from "@/lib/wing-api";

/**
 * "Your files" — the documents Wing reads.
 *
 * ── THE PROTOTYPE'S UPLOAD DID NOT UPLOAD ────────────────────────────────
 * Worth recording, because the screen looked finished. The two required-document inputs
 * were `readOnly` with no `onChange` — "Choose file" opened a picker and nothing
 * happened — and the assessment form collected a name and a type and then discarded
 * both, storing `file.name` and hardcoding the kind. All three are real here.
 *
 * ── THE UPLOAD IS JSON AND BASE64, NOT MULTIPART ─────────────────────────
 * Checked rather than assumed, because every instinct says otherwise. `POST /api/documents`
 * validates `req.body` against `insertDocumentSchema` and reads `{ name, fileName, type,
 * fileData }`, where `fileData` is a base64 string the store hands to Azure Blob. There is
 * no multipart parser on that route, so a `FormData` post arrives as an empty body and
 * fails validation with a message about missing fields that are visibly present.
 *
 * `type` matters beyond storage: the route kicks off `generateDocumentSummary` for exactly
 * `"resume"` and `"linkedin"`, and that summary is what reaches Wing's prompt. A resume
 * uploaded under any other type is stored, listed, and never read.
 *
 * ── LAYOUT MATCHES wing5's `routes/files.tsx` ─────────────────────────────
 * Card structure, the "Uploaded" pill, the accepted-format caption, the salmon-tinted
 * "why share these" callout, the assessment form's field styling, and the "My documents"
 * list all copied from wing5's own classes. `border-border`/`bg-card`/`bg-canvas` (wing5's
 * generic shadcn tokens) came across as this app's own `wing-border`/`bg-white`/
 * `wing-canvas` — the tokens the rest of this page (and the rest of the wing surface)
 * already uses, so one page doesn't end up speaking two border colours.
 *
 * Two content departures, both because this build accepts more than the caption used to
 * say: the required-document caption reads "PDF, DOC, DOCX" rather than wing5's "PDF
 * only" — the `accept` attribute on those inputs already took DOC/DOCX before this pass,
 * and a caption narrower than what the input actually accepts is the more misleading of
 * the two mismatches. And "How to download your LinkedIn profile" keeps this file's own
 * four-step list rather than wing5's, which is accurate but thinner.
 */
const ASSESSMENT_TYPES = [
  "Myers-Briggs Type Indicator (MBTI)",
  "Enneagram",
  "StrengthsFinder / CliftonStrengths",
  "VIA Character Strengths Survey",
  "DiSC Profile",
  "360° Leadership or Team Assessment",
  "Other professional assessment",
];

/**
 * The file as base64, without the data-URL prefix.
 *
 * `FileReader` rather than `btoa(String.fromCharCode(...bytes))`: the latter blows the
 * argument limit on anything past a few hundred kilobytes, and a 4MB PDF is exactly the
 * case that hits it — so the failure would only appear for large uploads.
 */
async function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("That file could not be read."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPTED = ["pdf", "doc", "docx"];

export default function WingFilesPage() {
  const queryClient = useQueryClient();
  const { exploreOpen, setExploreOpen, pickModule } = useWingNav();

  const { data: threads = [] } = useQuery({ queryKey: ["wing", "threads"], queryFn: listThreads });
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["wing", "documents"],
    queryFn: listDocuments,
  });

  const resume = docs.find((d) => d.kind === "Resume");
  const linkedin = docs.find((d) => d.kind === "LinkedIn profile");

  const upload = useMutation({
    mutationFn: async (vars: { file: File; type: string; name: string }) => {
      const res = await apiRequest("POST", "/api/documents", {
        name: vars.name,
        fileName: vars.file.name,
        type: vars.type,
        fileData: await toBase64(vars.file),
      });
      return await res.json();
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wing", "documents"] }),
  });

  const remove = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["wing", "documents"] }),
  });

  return (
    <AppShell threads={threads} activeThreadId={null} onOpenExplore={() => setExploreOpen(true)}>
      <OfflineBanner />
      {exploreOpen && <ExploreOverlay onClose={() => setExploreOpen(false)} onPick={pickModule} />}

      <div className="min-h-screen px-6 py-10">
        <div className="mx-auto max-w-[760px] pb-24">
          <h1 className="text-[30px] font-semibold text-wine">Your files</h1>
          <p className="mt-2 text-[15px] text-plum">
            The documents Wing reads to understand how you currently present your work.
          </p>

          <section className="mt-10">
            <p className="label-eyebrow">Required documents</p>
            <div className="mt-4 space-y-4">
              <RequiredDoc
                title="Resume"
                blurb="What you've done, in the form you send it out."
                doc={resume}
                uploading={upload.isPending}
                onUpload={(file) => upload.mutate({ file, type: "resume", name: "Resume" })}
                onRemove={(id) => remove.mutate(id)}
              />
              <RequiredDoc
                title="LinkedIn profile PDF"
                blurb="How you present the same work in public."
                doc={linkedin}
                uploading={upload.isPending}
                onUpload={(file) => upload.mutate({ file, type: "linkedin", name: "LinkedIn profile" })}
                onRemove={(id) => remove.mutate(id)}
              >
                <LinkedInSteps />
              </RequiredDoc>
            </div>
          </section>

          <section className="mt-12">
            <p className="label-eyebrow">Optional documents</p>
            <AssessmentUpload
              uploading={upload.isPending}
              onUpload={(file, type, name) => upload.mutate({ file, type, name })}
            />
          </section>

          <section className="mt-12">
            <p className="label-eyebrow">My documents</p>
            <div className="mt-4 rounded-xl bg-white p-6 ring-1 ring-wing-border">
              {isLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-plum/50" />
                </div>
              ) : docs.length === 0 ? (
                <p className="py-6 text-center text-[14px] text-plum">No documents uploaded yet.</p>
              ) : (
                <ul className="divide-y divide-wing-border">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-3">
                      <span className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-plum" />
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] text-forest">{d.name}</span>
                          <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
                            {d.kind}
                            {d.when ? ` · ${d.when}` : ""}
                          </span>
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => remove.mutate(d.id)}
                        aria-label={`Remove ${d.name}`}
                        className="rounded-full p-2 text-plum hover:bg-midnight/5 hover:text-forest"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <p className="mt-8 text-[13px] leading-relaxed text-plum">
            Trouble uploading? Write to support@mywing.ai. Your documents are only used to develop
            your positioning, and are never shared with third parties.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

function RequiredDoc({
  title,
  blurb,
  doc,
  uploading,
  onUpload,
  onRemove,
  children,
}: {
  title: string;
  blurb: string;
  doc?: WingDoc;
  uploading: boolean;
  onUpload: (file: File) => void;
  onRemove: (id: number) => void;
  children?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="rounded-xl bg-white p-6 ring-1 ring-wing-border">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-semibold text-forest">{title}</h3>
          <p className="mt-1 text-[14px] leading-relaxed text-plum">{blurb}</p>
        </div>
        {doc && (
          <span className="flex items-center gap-1.5 rounded-full bg-aqua px-3 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.12em] text-forest">
            <Check className="h-3.5 w-3.5" /> Uploaded
          </span>
        )}
      </div>

      {children}

      <p className="mt-4 font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
        Accepted format: PDF, DOC, DOCX
      </p>

      {doc ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-wing-canvas px-4 py-3">
          <span className="flex items-center gap-2 text-[14px] text-forest">
            <FileText className="h-4 w-4 text-plum" />
            {doc.name}
            <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
              {doc.when}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => input.current?.click()}
              className="rounded-full border border-midnight/30 px-4 py-1.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-midnight hover:bg-midnight/5 disabled:opacity-50"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onRemove(doc.id)}
              aria-label={`Remove ${doc.name}`}
              className="rounded-full p-2 text-plum hover:bg-midnight/5 hover:text-forest"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={uploading}
          onClick={() => input.current?.click()}
          className="mt-4 rounded-full bg-salmon px-6 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-white hover:opacity-90 disabled:opacity-50"
        >
          Choose file
        </button>
      )}

      <input
        ref={input}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          /* Reset first: picking the same file twice in a row fires no change event
             otherwise, and the second attempt looks like a dead button. */
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}

function LinkedInSteps() {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="font-sans text-[12px] font-semibold text-plum underline underline-offset-4 hover:text-forest"
      >
        {open ? "Hide the steps" : "How to download your LinkedIn profile"}
      </button>
      {open && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[14px] text-plum">
          <li>Open your profile on LinkedIn.</li>
          <li>Click the "More" button under your header.</li>
          <li>Choose "Save to PDF".</li>
          <li>Upload the file it downloads.</li>
        </ul>
      )}
    </div>
  );
}

function AssessmentUpload({
  uploading,
  onUpload,
}: {
  uploading: boolean;
  onUpload: (file: File, documentType: string, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) return setError("Give the document a name.");
    if (!type) return setError("Choose a document type.");
    if (!file) return setError("Choose a file to upload.");
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED.includes(ext)) return setError("Accepted formats: PDF, DOC, DOCX.");
    if (file.size > MAX_BYTES) return setError("Max file size is 4MB.");

    setError(null);
    /*
     * The name and the type both travel. The prototype collected them and threw them
     * away, so every assessment arrived as its raw filename with no indication of what
     * kind of assessment it was — which is the one thing that makes it useful to read.
     */
    /*
     * `assessment:<kind>` rather than a bare "assessment". The column is free text and
     * the route only special-cases "resume" and "linkedin", so encoding the kind here
     * costs nothing and is the only record of WHICH assessment this is — the prototype
     * collected that and dropped it, leaving a filename.
     */
    onUpload(file, `assessment:${type}`, name.trim());
    setName("");
    setType("");
    setFile(null);
  };

  return (
    <div className="mt-4 rounded-xl bg-white p-6 ring-1 ring-wing-border">
      <h3 className="text-[16px] font-semibold text-forest">
        Professional or personality assessments
      </h3>
      <p className="mt-1 text-[14px] leading-relaxed text-plum">
        MBTI, Enneagram, StrengthsFinder, VIA, DiSC, 360° reviews — anything that shows how
        you naturally work and communicate.
      </p>

      <div className="mt-5 rounded-xl border-l-[3px] border-salmon bg-salmon-light/25 px-5 py-4">
        <p className="text-[14px] leading-relaxed text-forest">
          Why share these? They make your positioning sound like you — genuine and
          sustainable, not a script you have to keep up.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <label className="block">
          <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
            Document name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., MBTI assessment results"
            className="mt-2 w-full rounded-xl bg-wing-canvas px-4 py-3 text-[14px] text-forest outline-none ring-1 ring-wing-border placeholder:text-plum/70 focus:ring-1 focus:ring-aqua"
          />
        </label>

        <label className="block">
          <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
            Document type
          </span>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-2 w-full rounded-xl bg-wing-canvas px-4 py-3 text-[14px] text-forest outline-none ring-1 ring-wing-border focus:ring-1 focus:ring-aqua"
          >
            <option value="">Select document type</option>
            {ASSESSMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
            Assessment file
          </span>
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mt-2 w-full rounded-xl bg-wing-canvas px-4 py-3 text-[14px] text-forest outline-none ring-1 ring-wing-border file:mr-4 file:rounded-full file:border-0 file:bg-aqua file:px-4 file:py-1.5 file:font-sans file:text-[11px] file:font-semibold file:uppercase file:tracking-[0.12em] file:text-forest"
          />
          <p className="mt-2 font-sans text-[11px] uppercase tracking-[0.12em] text-plum">
            Accepted formats: PDF, DOC, DOCX · Max file size 4MB
          </p>
        </label>

        {error && <p className="text-[13px] text-salmon">{error}</p>}

        <button
          type="button"
          disabled={uploading}
          onClick={submit}
          className="flex items-center gap-2 rounded-full bg-salmon px-7 py-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-white hover:opacity-90 disabled:opacity-50"
        >
          <Upload className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload assessment"}
        </button>
      </div>
    </div>
  );
}
