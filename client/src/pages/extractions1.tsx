import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";
import {
  Search,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  FileSearch,
  Download,
  XCircle,
  Trash2,
  Building2,
  ScrollText,
  ChevronRight,
  ArrowLeft,
  IndianRupee,
  FileText,
  File,
  Mail,
} from "lucide-react";
import type { Extraction, Tag, Site } from "@shared/schema";

interface SiteWithStatus extends Site {
  leaseCount: number;
  fileCount: number;
  extractionStatus: string;
}

interface SiteCost {
  siteId: number;
  siteName: string;
  totalInr: number;
  totalUsd: number;
  extractionInr: number;
}

interface LeaseCost {
  leaseId: number;
  leaseNumber: string;
  totalInr: number;
  totalUsd: number;
  extractionInr: number;
}

interface ExtractionWithContext extends Extraction {
  leaseNumber: string;
  siteId: string;
}

function formatInr(value: number): string {
  if (value < 0.01) return "₹0.00";
  return "₹" + value.toFixed(2);
}

interface SiteGroup {
  siteId: string;
  extractions: ExtractionWithContext[];
  completedCount: number;
  totalCount: number;
  hasCompleted: boolean;
  hasProcessing: boolean;
  hasFailed: boolean;
}

function getStatusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "processing":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "failed":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    default:
      return <Clock className="h-4 w-4 text-yellow-500" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/10">Completed</Badge>;
    case "processing":
      return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/10">Processing</Badge>;
    case "failed":
      return <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10">Failed</Badge>;
    default:
      return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/10">Pending</Badge>;
  }
}

export default function Extractions() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedExtraction, setSelectedExtraction] = useState<ExtractionWithContext | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: extractions, isLoading } = useQuery<ExtractionWithContext[]>({
    queryKey: ["/api/extractions"],
  });

  const { data: allTags } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const { data: sites } = useQuery<SiteWithStatus[]>({
    queryKey: ["/api/sites"],
  });

  const { data: siteCosts } = useQuery<SiteCost[]>({
    queryKey: ["/api/costs/by-site"],
  });

  const { data: fileTypeCounts } = useQuery<Record<string, Record<string, number>>>({
    queryKey: ["/api/file-type-counts"],
  });

  const expandedSiteDbId = expandedSite ? sites?.find((s) => s.siteId === expandedSite)?.id : null;

  const { data: leaseCosts } = useQuery<LeaseCost[]>({
    queryKey: ["/api/costs/by-lease", expandedSiteDbId],
    queryFn: async () => {
      if (!expandedSiteDbId) return [];
      const res = await fetch(`/api/costs/by-lease/${expandedSiteDbId}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!expandedSiteDbId,
  });

  const siteCostMap = new Map(
    Array.isArray(siteCosts) ? siteCosts.map((c) => [c.siteName, c]) : []
  );
  const leaseCostMap = new Map(
    Array.isArray(leaseCosts) ? leaseCosts.map((c) => [c.leaseId, c]) : []
  );

  const totalTagCount = allTags?.length ?? 0;

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await apiRequest("POST", "/api/extractions/delete-batch", { ids });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "Extractions deleted", description: `${data.deleted} extraction(s) removed.` });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = extractions?.filter((ext) => {
    const matchesSearch =
      ext.siteId.toLowerCase().includes(search.toLowerCase()) ||
      ext.leaseNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || ext.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const siteGroups: SiteGroup[] = (() => {
    if (!filtered) return [];
    const groupMap = new Map<string, ExtractionWithContext[]>();
    for (const ext of filtered) {
      const group = groupMap.get(ext.siteId) || [];
      group.push(ext);
      groupMap.set(ext.siteId, group);
    }
    return Array.from(groupMap.entries()).map(([siteId, exts]) => ({
      siteId,
      extractions: exts,
      completedCount: exts.filter((e) => e.status === "completed").length,
      totalCount: exts.length,
      hasCompleted: exts.some((e) => e.status === "completed"),
      hasProcessing: exts.some((e) => e.status === "processing"),
      hasFailed: exts.some((e) => e.status === "failed"),
    }));
  })();

  const currentSiteGroup = expandedSite ? siteGroups.find((g) => g.siteId === expandedSite) : null;

  const currentSiteIds = new Set(currentSiteGroup?.extractions.map((e) => e.id) ?? []);
  const visibleSelectedIds = new Set(Array.from(selectedIds).filter((id) => currentSiteIds.has(id)));

  const statusCounts = extractions?.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  function getTagCounts(results: Record<string, string> | null | undefined) {
    if (!results) return { found: 0, missing: 0 };
    const entries = Object.entries(results);
    const found = entries.filter(([, v]) => v && v !== "Not Found" && v.trim() !== "").length;
    const missing = entries.length - found;
    return { found, missing };
  }

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (!currentSiteGroup) return;
    const siteExtractionIds = currentSiteGroup.extractions.map((e) => e.id);
    if (visibleSelectedIds.size === siteExtractionIds.length) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of siteExtractionIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of siteExtractionIds) next.add(id);
        return next;
      });
    }
  };

  const handleExport = () => {
    if (!filtered || filtered.length === 0) return;
    const completedExtractions = filtered.filter((e) => e.status === "completed" && e.results);
    if (completedExtractions.length === 0) return;

    const tagNames = new Set<string>();
    completedExtractions.forEach((e) => {
      if (e.results) Object.keys(e.results).forEach((k) => tagNames.add(k));
    });

    const headers = ["Site ID", "Lease Number", ...Array.from(tagNames)];
    const rows = completedExtractions.map((e) => [
      e.siteId,
      e.leaseNumber,
      ...Array.from(tagNames).map((tag) => (e.results as any)?.[tag] || ""),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "extractions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          {expandedSite ? (
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={() => setExpandedSite(null)} data-testid="button-back-sites">
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold tracking-tight" data-testid="text-extractions-title">
                  {expandedSite}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {currentSiteGroup?.totalCount} lease extraction{currentSiteGroup?.totalCount !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-extractions-title">
                Extractions
              </h1>
              <p className="text-sm text-muted-foreground mt-1">View and manage tag extraction results by site</p>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {visibleSelectedIds.size > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={deleteMutation.isPending}
              data-testid="button-delete-selected"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete ({visibleSelectedIds.size})
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={!filtered?.some((e) => e.status === "completed")}
            data-testid="button-export-csv"
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {!expandedSite && statusCounts && Object.keys(statusCounts).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={statusFilter === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter("")}
          >
            All ({extractions?.length || 0})
          </Button>
          {Object.entries(statusCounts).map(([status, count]) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {getStatusIcon(status)}
              <span className="ml-1 capitalize">{status}</span> ({count})
            </Button>
          ))}
        </div>
      )}

      {!expandedSite && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by site ID or lease number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-extractions"
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : !expandedSite ? (
        siteGroups.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <FileSearch className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-1">No extractions found</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm">
                {search || statusFilter
                  ? "No extractions match your filters."
                  : "Start extracting tags from your lease documents in the Site Explorer."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {siteGroups.map((group) => {
              const allCompleted = group.completedCount === group.totalCount;
              let cardBg = "";
              if (allCompleted) {
                cardBg = "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700";
              } else if (group.hasCompleted) {
                cardBg = "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800";
              }

              return (
                <Card
                  key={group.siteId}
                  className={`transition-all cursor-pointer hover-elevate ${cardBg}`}
                  onClick={() => setExpandedSite(group.siteId)}
                  data-testid={`card-site-extraction-${group.siteId}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${allCompleted ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-primary/10"}`}>
                          <Building2 className={`h-5 w-5 ${allCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-base" data-testid={`text-site-group-${group.siteId}`}>
                            {group.siteId}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {group.totalCount} lease{group.totalCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {group.completedCount > 0 && (
                        <Badge variant="outline" className="text-xs gap-1 border-emerald-300 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
                          <CheckCircle2 className="h-3 w-3" />
                          {group.completedCount} completed
                        </Badge>
                      )}
                      {group.hasProcessing && (
                        <Badge variant="outline" className="text-xs gap-1 border-blue-300 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processing
                        </Badge>
                      )}
                      {group.hasFailed && (
                        <Badge variant="outline" className="text-xs gap-1 border-red-300 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                          <AlertCircle className="h-3 w-3" />
                          Failed
                        </Badge>
                      )}
                      {group.completedCount === 0 && !group.hasProcessing && !group.hasFailed && (
                        <Badge variant="outline" className="text-xs gap-1 border-yellow-300 text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </div>

                    {allCompleted && (
                      <div className="mt-3 h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                      </div>
                    )}
                    {group.hasCompleted && !allCompleted && (
                      <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(group.completedCount / group.totalCount) * 100}%` }} />
                      </div>
                    )}

                    {(() => {
                      const cost = siteCostMap.get(group.siteId);
                      if (!cost || cost.totalInr === 0) return null;
                      return (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400" data-testid={`text-cost-site-${group.siteId}`}>
                          <IndianRupee className="h-3 w-3" />
                          <span className="font-medium">{formatInr(cost.totalInr)}</span>
                          <span className="text-muted-foreground">(extraction)</span>
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <div className="space-y-4">
          {currentSiteGroup && (
            <>
              <div className="flex items-center gap-3">
                {currentSiteGroup.extractions.length > 0 && (
                  <Button variant="outline" size="sm" onClick={toggleSelectAll} data-testid="button-select-all">
                    {visibleSelectedIds.size === currentSiteGroup.extractions.length ? "Deselect All" : "Select All"}
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {currentSiteGroup.extractions.map((ext) => {
                  const { found, missing } = getTagCounts(ext.results);
                  const totalExpected = totalTagCount;
                  const successRate = totalExpected > 0 && ext.status === "completed" ? Math.round((found / totalExpected) * 100) : 0;
                  const isSelected = selectedIds.has(ext.id);

                  return (
                    <Card
                      key={ext.id}
                      className={`relative overflow-hidden transition-colors hover:border-primary/40 ${isSelected ? "ring-2 ring-primary border-primary" : ""}`}
                      data-testid={`card-extraction-${ext.id}`}
                    >
                      {ext.status === "completed" && (
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all"
                          style={{ width: `${successRate}%` }}
                        />
                      )}
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(ext.id)}
                              className="mt-1"
                              data-testid={`checkbox-extraction-${ext.id}`}
                            />
                            <div className="space-y-1">
                              <CardTitle className="text-base font-semibold flex items-center gap-2" data-testid={`text-lease-${ext.id}`}>
                                <ScrollText className="h-4 w-4 text-muted-foreground" />
                                {ext.leaseNumber}
                              </CardTitle>
                            </div>
                          </div>
                          {getStatusBadge(ext.status)}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {fileTypeCounts && fileTypeCounts[String(ext.leaseId)] && (
                          <div className="flex items-center gap-1.5 flex-wrap" data-testid={`file-types-${ext.id}`}>
                            {Object.entries(fileTypeCounts[String(ext.leaseId)]).map(([type, count]) => (
                              <Badge key={type} variant="outline" className="text-[10px] gap-1 px-1.5 py-0.5 font-medium">
                                {type === "pdf" ? <FileText className="h-3 w-3 text-red-500" /> :
                                 type === "docx" ? <FileText className="h-3 w-3 text-blue-500" /> :
                                 (type === "eml" || type === "msg") ? <Mail className="h-3 w-3 text-amber-500" /> :
                                 <File className="h-3 w-3 text-muted-foreground" />}
                                {count} .{type}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {ext.status === "completed" && ext.results ? (
                          <>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="flex items-center gap-2 p-2.5 rounded-md bg-emerald-500/10">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                <div>
                                  <p className="text-lg font-bold text-emerald-500" data-testid={`text-found-${ext.id}`}>{found}</p>
                                  <p className="text-xs text-muted-foreground">Extracted</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 p-2.5 rounded-md bg-red-500/10">
                                <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                <div>
                                  <p className="text-lg font-bold text-red-500" data-testid={`text-missing-${ext.id}`}>{missing}</p>
                                  <p className="text-xs text-muted-foreground">Not Found</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between text-xs text-muted-foreground">
                              <span>Out of {totalExpected} tags</span>
                              <span>{successRate}% success</span>
                            </div>
                            {ext.extractedAt && (
                              <p className="text-xs text-muted-foreground">
                                Extracted {new Date(ext.extractedAt).toLocaleString()}
                              </p>
                            )}
                          </>
                        ) : ext.status === "processing" ? (
                          <div className="flex items-center gap-2 text-sm text-blue-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Extracting tags...
                          </div>
                        ) : ext.status === "failed" ? (
                          <p className="text-sm text-red-500">Extraction failed. Try again from Site Explorer.</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">Waiting to be processed...</p>
                        )}
                        {(() => {
                          const cost = leaseCostMap.get(ext.leaseId);
                          if (!cost || cost.totalInr === 0) return null;
                          return (
                            <div className="flex items-center gap-1.5 text-xs text-orange-600 dark:text-orange-400" data-testid={`text-cost-lease-${ext.id}`}>
                              <IndianRupee className="h-3 w-3" />
                              <span className="font-medium">{formatInr(cost.totalInr)}</span>
                              <span className="text-muted-foreground">(extraction)</span>
                            </div>
                          );
                        })()}
                        {ext.status === "completed" && ext.results && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full"
                            onClick={() => setSelectedExtraction(ext)}
                            data-testid={`button-view-extraction-${ext.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View Details
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Extractions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {visibleSelectedIds.size} extraction(s)? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate(Array.from(visibleSelectedIds));
                setShowDeleteDialog(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!selectedExtraction} onOpenChange={() => setSelectedExtraction(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Extraction Results — {selectedExtraction?.siteId} / {selectedExtraction?.leaseNumber}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {selectedExtraction?.results && (
              <div className="space-y-2 pr-4">
                {Object.entries(selectedExtraction.results)
                  .sort(([, a], [, b]) => {
                    const aFound = a && a !== "Not Found" && a.trim() !== "";
                    const bFound = b && b !== "Not Found" && b.trim() !== "";
                    if (aFound && !bFound) return -1;
                    if (!aFound && bFound) return 1;
                    return 0;
                  })
                  .map(([tag, value]) => {
                    const isFound = value && value !== "Not Found" && value.trim() !== "";
                    return (
                      <div
                        key={tag}
                        className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-3 rounded-md ${
                          isFound ? "bg-emerald-500/5 border border-emerald-500/10" : "bg-red-500/5 border border-red-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-[200px]">
                          {isFound ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span className="text-sm font-medium text-muted-foreground">{tag}</span>
                        </div>
                        <span className="text-sm flex-1">{isFound ? value : "Not Found"}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
