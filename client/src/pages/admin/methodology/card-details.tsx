import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Info, Lock, Pencil } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { Advisory, Heuristic } from "./heuristic";

/**
 * The card's own fields — name, description, tags, type, kind — and the banner
 * that has to be read before any of them is touched.
 *
 * ── WHY THE BANNER IS NOT PART OF THE CARD'S TEXT ────────────────────────
 * Every advisory here is also written into the card's notes at seed time, and
 * that is the right place for a reader. It is the wrong place for a warning:
 * notes became editable in the same change that added this editor, so a banner
 * driven by matching strings in the notes would disappear the first time
 * somebody tidied them. The server derives `advisory` from the declared
 * registries instead — the safety constants, the known-absent list, the retired
 * and reserved tables — and it cannot be edited away.
 */

const KIND_OPTIONS = [
  { value: "coaching_card", label: "Coaching card — can fire on a student's turn" },
  { value: "integrity_gate", label: "Integrity gate — checks Wing's own output" },
  { value: "exercise", label: "Exercise — routed to by another card, never by signal" },
];

const INTERVENTION_TYPES = [
  "COACH", "CHALLENGE", "REDIRECT", "REFRAME", "AFFIRM", "META", "GATE",
  "ELICIT", "OBSERVE", "EDUCATE", "SAFETY_OVERRIDE",
];

const ADVISORY_STYLE: Record<
  Advisory["kind"],
  { icon: typeof Info; className: string; textClass: string }
> = {
  code_enforced: {
    icon: Lock,
    className: "border-warn/30 bg-warn-soft",
    textClass: "text-warn",
  },
  text_unavailable: {
    icon: AlertTriangle,
    className: "border-warn/30 bg-warn-soft",
    textClass: "text-warn",
  },
  retired: { icon: Info, className: "border-muted bg-muted/40", textClass: "text-muted-foreground" },
  reserved: { icon: Info, className: "border-muted bg-muted/40", textClass: "text-muted-foreground" },
};

export function AdvisoryBanner({ advisory }: { advisory: Advisory | null | undefined }) {
  if (!advisory) return null;
  const style = ADVISORY_STYLE[advisory.kind];
  const Icon = style.icon;
  return (
    <Alert className={style.className}>
      <Icon className={`h-4 w-4 ${style.textClass}`} />
      <AlertTitle className={style.textClass}>{advisory.title}</AlertTitle>
      <AlertDescription className={style.textClass}>{advisory.body}</AlertDescription>
    </Alert>
  );
}

export function CardDetailsEditor({ card }: { card: Heuristic }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const [name, setName] = useState(card.name);
  const [description, setDescription] = useState(card.description);
  const [tags, setTags] = useState((card.populationTags ?? []).join(", "));
  const [interventionType, setInterventionType] = useState(card.interventionType ?? "none");
  const [cardKind, setCardKind] = useState<string>(card.cardKind ?? "coaching_card");
  const [acknowledged, setAcknowledged] = useState(false);

  const kindChanged = cardKind !== (card.cardKind ?? "coaching_card");

  function reset() {
    setName(card.name);
    setDescription(card.description);
    setTags((card.populationTags ?? []).join(", "));
    setInterventionType(card.interventionType ?? "none");
    setCardKind(card.cardKind ?? "coaching_card");
    setAcknowledged(false);
  }

  const save = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/admin/heuristics/${card.id}`, {
        name,
        description,
        populationTags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        interventionType: interventionType === "none" ? null : interventionType,
        cardKind,
        // Sent only when the kind actually moved, so an ordinary edit never
        // carries a blanket acknowledgement the server would honour.
        ...(kindChanged ? { acknowledgeKindChange: acknowledged } : {}),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/admin/heuristics/${card.id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/heuristics"] });
      setOpen(false);
      setAcknowledged(false);
      toast({ title: "Card updated", description: `${card.cardCode ?? card.name} saved.` });
    },
    onError: (error: Error) => {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
    },
  });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Pencil className="mr-2 h-3.5 w-3.5" />
        Edit details
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {card.cardCode ? `${card.cardCode} — card details` : "Card details"}
            </DialogTitle>
            <DialogDescription>
              The card's own fields. Components and status are edited on the page behind
              this dialog. The card code is fixed — sequence entries, gate audit findings
              and every routing map bind to it.
            </DialogDescription>
          </DialogHeader>

          <AdvisoryBanner advisory={card.advisory} />

          <div className="space-y-4">
            <div>
              <Label htmlFor="card-name">Name</Label>
              <Input id="card-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <Label htmlFor="card-description">Description</Label>
              <Textarea
                id="card-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="card-tags">Population tags</Label>
              <Input
                id="card-tags"
                value={tags}
                placeholder="undergraduate, early_career — leave empty to apply to everyone"
                onChange={(e) => setTags(e.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Comma separated. An untagged card applies to every population.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Intervention type</Label>
                <Select value={interventionType} onValueChange={setInterventionType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not stated</SelectItem>
                    {INTERVENTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Kind</Label>
                <Select value={cardKind} onValueChange={setCardKind}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {KIND_OPTIONS.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {kindChanged && (
              <Alert className="border-warn/30 bg-warn-soft">
                <AlertTriangle className="h-4 w-4 text-warn" />
                <AlertTitle className="text-warn">
                  This changes what the engine does with the card
                </AlertTitle>
                <AlertDescription className="text-warn">
                  <p>
                    A coaching card enters the detector catalogue and can fire on a
                    student's turn. An integrity gate never does — it checks Wing's own
                    output. An exercise is reached only by another card naming it.
                  </p>
                  <p className="mt-2">
                    Moving <strong>{card.cardCode ?? card.name}</strong> from{" "}
                    <strong>{card.cardKind ?? "coaching_card"}</strong> to{" "}
                    <strong>{cardKind}</strong> takes effect on the next session, silently.
                  </p>
                  <label className="mt-3 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={acknowledged}
                      onChange={(e) => setAcknowledged(e.target.checked)}
                    />
                    <span>I understand what this changes.</span>
                  </label>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={
                save.isPending ||
                !name.trim() ||
                !description.trim() ||
                (kindChanged && !acknowledged)
              }
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
