import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The card editor — field specs, the field renderer, and the new-card dialog.
 *
 * The guidance below each field is deliberately in the UI rather than only in
 * METHODOLOGY_AUTHORING.md. A vague `signal` fires at the wrong moments and a
 * missing `success_criteria` means the card can never be scored — so it can
 * never accumulate the evidence that would validate it. Both failure modes are
 * silent, which is exactly why the warning belongs at the point of writing.
 */

export const COMPONENT_TYPES = [
  // The v2 seven, in the order the compendium writes them. `intervention_type`
  // is absent deliberately: it is a COLUMN on the card, not a component row, so
  // the detail screen shows it as a property rather than an editable field.
  "signal", "detection_method", "coaching_move", "delivery_adaptation",
  "success_criteria", "failure_path",
  // Reference.
  "module_mapping", "notes",
  // Pre-v2. Kept so the earlier extracted cards still render and stay editable.
  "intervention", "outcome", "population_context",
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

/**
 * Which band a field belongs to.
 *
 * The detail screen groups by this rather than showing eleven identical boxes.
 * A v2 card has no `intervention` and no `outcome`, so rendering those as empty
 * fields with placeholder text reads as "you forgot these" when the truth is
 * "v2 does not use them". The legacy band stays collapsed unless it has content.
 */
export type FieldGroup = "core" | "reference" | "legacy";

type FieldSpec = {
  label: string;
  group: FieldGroup;
  /**
   * What the engine does with this, or null when nothing reads it yet.
   *
   * A sentence rather than a boolean, because "used by engine" was doing too
   * much work: `signal` is matched against every student turn, `outcome` is read
   * only by post-session scoring, and `detection_method` is stored and not read
   * at all. Three different things, and a reviewer deciding whether a field
   * matters needs to know which one it is.
   */
  engineUse: string | null;
  help: string;
  placeholder: string;
  goodExample?: string;
  poorExample?: string;
};

export const COMPONENT_SPECS: Record<ComponentType, FieldSpec> = {
  signal: {
    label: "Signal",
    group: "core",
    engineUse: "Matched against every student turn by the detector.",
    help:
      "What this pattern looks like in the student's own words. Describe " +
      "observable behaviour rather than an inference about their psychology, and " +
      "be specific about quantity and form.",
    placeholder:
      "Student names four or more distinct target roles without an ordering or a stated basis for choosing between them.",
    goodExample:
      "Student names four or more distinct target roles without an ordering or a stated basis for choosing between them.",
    poorExample: "Student is avoiding commitment.",
  },
  detection_method: {
    label: "Detection method",
    group: "core",
    engineUse: null,
    help:
      "How the signal should be detected — keyword match, behavioural pattern, " +
      "cross-session comparison. Stored now; the detector does not read it yet, " +
      "so today it records intent rather than changing behaviour.",
    placeholder:
      "Keyword matching on a single turn. Cross-session comparison against the function stated at intake.",
  },
  coaching_move: {
    label: "Coaching move",
    group: "core",
    engineUse: "Given to Wing as guidance for its next reply.",
    help: "What Wing should say and do — tone, pacing, and what not to do.",
    placeholder:
      "Do not resolve it for them. Name the pattern once, ask, and hold the silence.",
  },
  delivery_adaptation: {
    label: "Delivery adaptation",
    group: "core",
    engineUse: "Appended to the guidance as how to adapt the delivery.",
    help:
      "How delivery changes by audience. This is the field where the seven " +
      "populations actually differ — without it every population receives " +
      "identical coaching language.",
    placeholder:
      "Undergraduate: normalise it first. Executive: concise, high-signal, minimal scaffolding.",
  },
  success_criteria: {
    label: "Success criteria",
    group: "core",
    engineUse: null,
    help:
      "What you would observe in the student's next few turns if this worked. " +
      "Describe the observation, not how you would feel about it. Scoring still " +
      "reads the pre-v2 Outcome field, so this is recorded and not yet scored.",
    placeholder:
      "Student names one role and articulates the tradeoff they feel in choosing it.",
    goodExample: "Student names one role and articulates the tradeoff they feel in choosing it.",
    poorExample: "Student gains clarity.",
  },
  failure_path: {
    label: "Failure path",
    group: "core",
    engineUse: "Passed as a contingency, used only if the move does not land.",
    help:
      "What to do when the intervention does not work, including which card fires " +
      "next. Wing receives it as a fallback, so write it as a condition rather " +
      "than an instruction.",
    placeholder:
      "If the student cannot choose, accept it provisionally and note it for Session 2 to pressure-test.",
  },

  module_mapping: {
    label: "Module mapping",
    group: "reference",
    engineUse: null,
    help:
      "Where in the arc this applies. Which session the card actually fires in is " +
      "set on the sequence entry, not here — this is the methodology's own note.",
    placeholder: "Foundation 1",
  },
  notes: {
    label: "Notes",
    group: "reference",
    engineUse: null,
    help: "Provenance, corpus evidence, and anything else worth recording.",
    placeholder: "",
  },

  intervention: {
    label: "Intervention",
    group: "legacy",
    engineUse: "Given to Wing as guidance, when present.",
    help:
      "The pre-v2 free-text intervention. v2 splits it in two — the type is a " +
      "property of the card, the words live in Coaching move — so a v2 card leaves " +
      "this empty and that is correct.",
    placeholder: "",
  },
  outcome: {
    label: "Outcome",
    group: "legacy",
    engineUse: "Read by post-session scoring.",
    help:
      "The pre-v2 name for Success criteria, and still the field scoring reads. A " +
      "card needs it to accumulate the evidence that would validate it.",
    placeholder: "",
  },
  population_context: {
    label: "Population context",
    group: "legacy",
    engineUse: null,
    help:
      "Superseded by the population tags on the card and by Delivery adaptation.",
    placeholder: "",
  },
};

/**
 * Fields the engine reads today, for the new-card warning.
 *
 * Not the same list as "core": `detection_method` and `success_criteria` are
 * core to the methodology and read by nothing yet, and saying otherwise in a
 * warning would be a promise the platform does not keep.
 */
export const ENGINE_COMPONENTS: ComponentType[] = [
  "signal", "coaching_move", "delivery_adaptation",
];

export const GROUP_LABELS: Record<FieldGroup, string> = {
  core: "The card",
  reference: "Reference",
  legacy: "Pre-v2 fields",
};

export function fieldsIn(group: FieldGroup): ComponentType[] {
  return COMPONENT_TYPES.filter((t) => COMPONENT_SPECS[t].group === group);
}

/* ── Read view ──────────────────────────────────────────────────────────── */

/**
 * A field as a reviewer reads it, not as an author edits it.
 *
 * The screen opens in this mode because reviewing 53 cards is the job in front
 * of Danielle, and eleven simultaneously-editable textareas make a card
 * impossible to read. Editing is one click away per field.
 */
export function ComponentReadout({
  type,
  content,
}: {
  type: ComponentType;
  content: string | null;
}) {
  const spec = COMPONENT_SPECS[type];

  if (!content) {
    return (
      <p className="text-sm italic text-muted-foreground">
        Not written.{" "}
        {spec.group === "legacy"
          ? "v2 cards do not use this field."
          : "This card will behave as if it says nothing."}
      </p>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
      {content}
    </p>
  );
}

/* ── Edit view ──────────────────────────────────────────────────────────── */

export function ComponentField({
  type,
  value,
  onChange,
  rows = 4,
}: {
  type: ComponentType;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const spec = COMPONENT_SPECS[type];
  const [showExample, setShowExample] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={`component-${type}`} className="flex items-center gap-2">
          {spec.label}
          <EngineUseBadge type={type} />
        </Label>
        {spec.goodExample && (
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => setShowExample((s) => !s)}
          >
            {showExample ? "Hide example" : "Show example"}
          </button>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{spec.help}</p>

      {showExample && spec.goodExample && (
        <div className="rounded-md border bg-muted/40 p-2 text-xs">
          <p className="text-good">
            <span className="font-medium">Good:</span> {spec.goodExample}
          </p>
          {spec.poorExample && (
            <p className="mt-1 text-warn">
              <span className="font-medium">Poor:</span> {spec.poorExample}
            </p>
          )}
        </div>
      )}

      <Textarea
        id={`component-${type}`}
        rows={rows}
        value={value}
        placeholder={spec.placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Says what the engine does with a field, or that nothing does yet. */
export function EngineUseBadge({ type }: { type: ComponentType }) {
  const spec = COMPONENT_SPECS[type];
  return spec.engineUse ? (
    <span
      title={spec.engineUse}
      className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary"
    >
      read by engine
    </span>
  ) : (
    <span
      title="Stored and reviewable, but nothing reads it at runtime yet."
      className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
    >
      stored only
    </span>
  );
}

/* ── New card dialog ────────────────────────────────────────────────────── */

export function NewHeuristicDialog({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: any) => void;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [components, setComponents] = useState<Record<string, string>>({});

  const setComponent = (type: ComponentType, v: string) =>
    setComponents((c) => ({ ...c, [type]: v }));

  const missingEngineFields = ENGINE_COMPONENTS.filter((t) => !components[t]?.trim());
  const canSubmit = name.trim() && description.trim() && !isSubmitting;

  /*
   * Core plus reference only. Offering the three pre-v2 fields on a NEW card
   * invites someone to fill in a field the methodology has replaced, and then to
   * wonder why it sits oddly beside the v2 ones. They stay editable on cards that
   * already have them.
   */
  const offered = [...fieldsIn("core"), ...fieldsIn("reference")];

  const handleSubmit = () => {
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      populationTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      components: offered
        .filter((t) => components[t]?.trim())
        .map((t) => ({ componentType: t, content: components[t].trim() })),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New heuristic card</DialogTitle>
          <DialogDescription>
            Created as a <strong>candidate</strong>. It will not reach students until
            you add it to a cycle's sequence — at which point it fires like any other card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              placeholder="H-031 Premature narrowing"
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={2}
              value={description}
              placeholder="One sentence: what pattern this card is about."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tags">Population tags</Label>
            <Input
              id="tags"
              value={tags}
              placeholder="early_career, executive"
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Comma separated. A card with no tags applies to everyone.
            </p>
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-1 text-sm font-medium">Components</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Each is versioned separately — revising one later leaves the others untouched.
            </p>
            <div className="space-y-5">
              {offered.map((type) => (
                <ComponentField
                  key={type}
                  type={type}
                  value={components[type] ?? ""}
                  onChange={(v) => setComponent(type, v)}
                  rows={type === "notes" ? 2 : 3}
                />
              ))}
            </div>
          </div>

          {missingEngineFields.length > 0 && (
            <div className="rounded-md border border-warn/30 bg-warn-soft p-3 text-xs text-warn">
              <p className="font-medium">
                {missingEngineFields.map((f) => COMPONENT_SPECS[f].label).join(", ")} not filled in
              </p>
              <p className="mt-1">
                You can save without {missingEngineFields.length === 1 ? "it" : "them"}, but the
                card will not work fully. Without a <strong>signal</strong> it never fires at
                all. Without a <strong>coaching move</strong> Wing has nothing to act on when it
                does. Without <strong>delivery adaptation</strong> every population receives
                identical language.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create card
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
