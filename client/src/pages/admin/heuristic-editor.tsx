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
 * The card editor.
 *
 * The guidance below each field is deliberately in the UI rather than only in
 * METHODOLOGY_AUTHORING.md. A vague `signal` fires at the wrong moments and a
 * missing `outcome` means the card can never be scored — so the card can never
 * accumulate the evidence that would validate it. Those two failure modes are
 * silent, which is exactly why the warning belongs at the point of writing.
 */

export const COMPONENT_TYPES = [
  "signal", "intervention", "coaching_move", "outcome",
  "module_mapping", "population_context", "notes",
] as const;

export type ComponentType = (typeof COMPONENT_TYPES)[number];

type FieldSpec = {
  label: string;
  usedByEngine: boolean;
  help: string;
  placeholder: string;
  goodExample?: string;
  poorExample?: string;
};

export const COMPONENT_SPECS: Record<ComponentType, FieldSpec> = {
  signal: {
    label: "Signal",
    usedByEngine: true,
    help:
      "What this pattern looks like in the student's own words. Matched against " +
      "every student turn, so describe observable behaviour, not an inference " +
      "about their psychology. Be specific about quantity and form.",
    placeholder:
      "Student names four or more distinct target roles without an ordering or a stated basis for choosing between them.",
    goodExample:
      "Student names four or more distinct target roles without an ordering or a stated basis for choosing between them.",
    poorExample: "Student is avoiding commitment.",
  },
  intervention: {
    label: "Intervention",
    usedByEngine: true,
    help: "What Wing should do when the signal fires. Given to Wing as guidance for its next reply.",
    placeholder:
      'Ask for a single forced choice under a hypothetical constraint — "if you had to bet on one today?" — then ask what it costs them.',
  },
  coaching_move: {
    label: "Coaching move",
    usedByEngine: true,
    help: "How the intervention should be delivered — tone, pacing, what not to do.",
    placeholder:
      "Do not resolve it for them. Name the pattern once, ask, and hold the silence.",
  },
  outcome: {
    label: "Outcome",
    usedByEngine: true,
    help:
      "What success looks like, compared against what the student says afterwards. " +
      "Describe what you would observe, not how you would feel about it. Without " +
      "this the card can never be scored, so it can never be validated.",
    placeholder:
      "Student names one role and articulates the tradeoff they feel in choosing it.",
    goodExample: "Student names one role and articulates the tradeoff they feel in choosing it.",
    poorExample: "Student gains clarity.",
  },
  module_mapping: {
    label: "Module mapping",
    usedByEngine: false,
    help: "Where in the arc this applies. Recorded for now; not yet read by the engine.",
    placeholder: "Foundation Session 1; Enhancement Module A.",
  },
  population_context: {
    label: "Population context",
    usedByEngine: false,
    help: "Who this applies to. Recorded for now; not yet read by the engine.",
    placeholder: "Common in early-career operators whose work has been cross-functional.",
  },
  notes: {
    label: "Notes",
    usedByEngine: false,
    help: "Anything else worth recording about this card.",
    placeholder: "",
  },
};

/** The four the engine actually reads. */
export const ENGINE_COMPONENTS: ComponentType[] = [
  "signal", "intervention", "coaching_move", "outcome",
];

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
          {spec.usedByEngine && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
              used by engine
            </span>
          )}
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
          <p className="text-emerald-700">
            <span className="font-medium">Good:</span> {spec.goodExample}
          </p>
          {spec.poorExample && (
            <p className="mt-1 text-amber-800">
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

  const handleSubmit = () => {
    onSubmit({
      name: name.trim(),
      description: description.trim(),
      populationTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      components: COMPONENT_TYPES.filter((t) => components[t]?.trim()).map((t) => ({
        componentType: t,
        content: components[t].trim(),
      })),
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
              placeholder="early_career, cross_functional"
              onChange={(e) => setTags(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma separated.</p>
          </div>

          <div className="border-t pt-4">
            <h3 className="mb-1 text-sm font-medium">Components</h3>
            <p className="mb-4 text-xs text-muted-foreground">
              Each is versioned separately — revising one later leaves the others untouched.
            </p>
            <div className="space-y-5">
              {COMPONENT_TYPES.map((type) => (
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
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-medium">
                {missingEngineFields.map((f) => COMPONENT_SPECS[f].label).join(", ")} not filled in
              </p>
              <p className="mt-1">
                You can save without {missingEngineFields.length === 1 ? "it" : "them"}, but the
                card will not work fully: without a <strong>signal</strong> it never fires, and
                without an <strong>outcome</strong> it can never be scored — so it can never
                accumulate the evidence to be validated.
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
