import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Info, Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Academic calendar touchpoints (Feature List B3 S4).
 *
 * "Per-institution config. Adapts to completion status."
 *
 * ── ONE EVENT SENDS TWO DIFFERENT MESSAGES ───────────────────────────────
 * Each event resolves to `<template>_complete` or `<template>_incomplete`
 * depending on how many sessions the student has finished. A recruiting-season
 * message to someone who has done the work and someone who has not are
 * different messages with different jobs — sending one text to both is what
 * makes calendar mail read as a mailing list.
 *
 * The screen says so explicitly, because an admin configuring a single template
 * key would otherwise have no way to know two are involved.
 */

type CalendarEvent = {
  id: number;
  institutionId: number;
  institutionName: string;
  label: string;
  eventDate: string;
  templateKey: string | null;
  active: boolean;
};

type Institution = { id: number; name: string; cycles: { id: number; label: string }[] };

/** Template bases that have completion-aware variants seeded. */
const TEMPLATE_BASES = [{ value: "calendar_touchpoint", label: "Calendar touchpoint" }];

export function CalendarPanel() {
  const { toast } = useToast();

  const [institutionId, setInstitutionId] = useState("");
  const [label, setLabel] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [templateKey, setTemplateKey] = useState("calendar_touchpoint");

  const institutions = useQuery<Institution[]>({
    queryKey: ["/api/admin/metrics/options"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/metrics/options")).json(),
  });

  const events = useQuery<CalendarEvent[]>({
    queryKey: ["/api/admin/calendar-events"],
    queryFn: async () => (await apiRequest("GET", "/api/admin/calendar-events")).json(),
  });

  const create = useMutation({
    mutationFn: async () =>
      (
        await apiRequest("POST", "/api/admin/calendar-events", {
          institutionId: Number(institutionId),
          label: label.trim(),
          eventDate,
          templateKey,
        })
      ).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar-events"] });
      setLabel("");
      setEventDate("");
      toast({ title: "Touchpoint added" });
    },
    onError: (e: Error) =>
      toast({ title: "Couldn't add that", description: e.message, variant: "destructive" }),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) =>
      (await apiRequest("PATCH", `/api/admin/calendar-events/${id}`, { active })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar-events"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("DELETE", `/api/admin/calendar-events/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/admin/calendar-events"] }),
  });

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (events.data ?? []).filter((e) => e.eventDate >= today);
  }, [events.data]);

  const past = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return (events.data ?? []).filter((e) => e.eventDate < today);
  }, [events.data]);

  const canCreate = institutionId && label.trim() && eventDate && !create.isPending;

  const renderEvent = (e: CalendarEvent) => (
    <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{e.label}</span>
          {!e.active && <Badge variant="outline">paused</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {e.institutionName} · {new Date(e.eventDate).toLocaleDateString()}
          {e.templateKey ? ` · ${e.templateKey}` : " · no template — sends nothing"}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggle.mutate({ id: e.id, active: !e.active })}
        >
          {e.active ? "Pause" : "Resume"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => remove.mutate(e.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
        <Alert className="border-info/25 bg-info-soft [&>svg]:text-info">
          <Info className="h-4 w-4" />
          <AlertTitle>Each date sends two different messages</AlertTitle>
          <AlertDescription>
            Students who've finished all three sessions get a message about using their
            positioning; students who haven't get one about getting ready. Same date, different
            job — edit both under <strong>Academic calendar</strong> in Messages.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Add a touchpoint</CardTitle>
            <CardDescription>
              Sends on the morning of that date to every active student at the institution.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Institution</Label>
              <Select value={institutionId} onValueChange={setInstitutionId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose" />
                </SelectTrigger>
                <SelectContent>
                  {(institutions.data ?? []).map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">What is it?</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Recruiting season"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventDate">Date</Label>
              <Input
                id="eventDate"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Select value={templateKey} onValueChange={setTemplateKey}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_BASES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="sm:col-span-2">
              <Button disabled={!canCreate} onClick={() => create.mutate()}>
                {create.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Add touchpoint
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coming up</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {events.isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!events.isLoading && upcoming.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nothing scheduled. Worth asking Danielle for each partner's key dates.
              </p>
            )}
            {upcoming.map(renderEvent)}
          </CardContent>
        </Card>

        {past.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Past</CardTitle>
              <CardDescription>Kept as a record of what was sent when.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 opacity-60">{past.map(renderEvent)}</CardContent>
          </Card>
        )}
    </div>
  );
}
