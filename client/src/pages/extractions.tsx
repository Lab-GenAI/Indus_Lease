import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { motion } from "framer-motion";
import { PageWrapper, PageHeader, fadeSlideUp, staggerContainer } from "@/components/motion-primitives";
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
import { useState, useEffect, useMemo } from "react";
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
  FolderOpen,
  AlertTriangle,
  Play,
} from "lucide-react";
import type { Extraction, Tag, Site } from "@shared/schema";
import { useProgress } from "@/hooks/use-progress";
import { ModelSelector, useDefaultExtractionOverrides, type ExtractionOverrides } from "@/components/model-selector";

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
  dbId: number;
  extractions: ExtractionWithContext[];
  completedCount: number;
  totalCount: number;
  hasCompleted: boolean;
  hasProcessing: boolean;
  hasFailed: boolean;
  hasError: boolean;
}

function hasExtractionErrors(results: Record<string, string> | null | undefined): boolean {
  if (!results) return false;
  return Object.values(results).some(
    (v) => v && v.toLowerCase().includes("extraction error")
  );
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
  const [activeTab, setActiveTab] = useState<string>("not-extracted");
  const [batchCount, setBatchCount] = useState<number>(5);
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const defaultOverrides = useDefaultExtractionOverrides();
  const [modelOverrides, setModelOverrides] = useState<ExtractionOverrides | null>(null);
  const currentModel = modelOverrides || defaultOverrides;

  const { activeProgress, trackTask } = useProgress(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
  });

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

  const batchExtractMutation = useMutation({
    mutationFn: async (siteIds: number[]) => {
      const body: any = { siteIds, model: currentModel.model, baseUrl: currentModel.baseUrl };
      const res = await apiRequest("POST", "/api/extractions/start-sites", body);
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.taskId) trackTask(data.taskId);
      if (data.leaseTaskIds) {
        Object.values(data.leaseTaskIds).forEach((tid: any) => trackTask(tid));
      }
      toast({
        title: "Extraction started",
        description: `Started extraction for ${data.started || 0} lease(s). ${data.skipped ? `${data.skipped} skipped.` : ""}`,
      });
      setSelectedSiteIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    },
    onError: (err: any) => {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
    },
  });

  const filtered = extractions?.filter((ext) => {
    const matchesSearch =
      ext.siteId.toLowerCase().includes(search.toLowerCase()) ||
      ext.leaseNumber.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = !statusFilter || ext.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const siteGroups: SiteGroup[] = useMemo(() => {
    if (!filtered || !sites) return [];
    const groupMap = new Map<string, ExtractionWithContext[]>();
    for (const ext of filtered) {
      const group = groupMap.get(ext.siteId) || [];
      group.push(ext);
      groupMap.set(ext.siteId, group);
    }
    return Array.from(groupMap.entries()).map(([siteId, exts]) => {
      const site = sites.find((s) => s.siteId === siteId);
      return {
        siteId,
        dbId: site?.id ?? 0,
        extractions: exts,
        completedCount: exts.filter((e) => e.status === "completed").length,
        totalCount: exts.length,
        hasCompleted: exts.some((e) => e.status === "completed"),
        hasProcessing: exts.some((e) => e.status === "processing"),
        hasFailed: exts.some((e) => e.status === "failed"),
        hasError: exts.some((e) => e.status === "completed" && hasExtractionErrors(e.results as any)),
      };
    });
  }, [filtered, sites]);

  const extractedSiteIds = useMemo(() => {
    const ids = new Set<string>();
    if (extractions) {
      for (const ext of extractions) {
        ids.add(ext.siteId);
      }
    }
    return ids;
  }, [extractions]);

  const extractedSites = useMemo(() => {
    if (!sites) return [];
    return sites.filter((s) => extractedSiteIds.has(s.siteId));
  }, [sites, extractedSiteIds]);

  const notExtractedSites = useMemo(() => {
    if (!sites) return [];
    return sites.filter((s) => !extractedSiteIds.has(s.siteId));
  }, [sites, extractedSiteIds]);

  const totalSites = sites?.length ?? 0;
  const extractedCount = extractedSites.length;
  const notExtractedCount = notExtractedSites.length;

  useEffect(() => {
    if (activeTab === "not-extracted" && notExtractedSites.length > 0) {
      const count = Math.min(batchCount, notExtractedSites.length);
      const autoSelected = new Set(notExtractedSites.slice(0, count).map((s) => s.id));
      setSelectedSiteIds(autoSelected);
    } else if (activeTab !== "not-extracted") {
      setSelectedSiteIds(new Set());
    }
  }, [batchCount, notExtractedSites, activeTab]);

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
    if (!results) return { found: 0, missing: 0, errors: 0 };
    const entries = Object.entries(results);
    let found = 0;
    let errors = 0;
    let missing = 0;
    for (const [, v] of entries) {
      if (v && v.toLowerCase().includes("extraction error")) {
        errors++;
      } else if (v && v !== "Not Found" && v.trim() !== "") {
        found++;
      } else {
        missing++;
      }
    }
    return { found, missing, errors };
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

  const toggleSiteSelect = (siteId: number) => {
    setSelectedSiteIds((prev) => {
      const next = new Set(prev);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const handleExport = async () => {
    if (!extractions?.some((e) => e.status === "completed")) return;

    try {
      const response = await fetch("/api/extractions/export");
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: "Export failed" }));
        throw new Error(err.detail || "Export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "extractions_export.xlsx";
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Export complete", description: "Excel file downloaded successfully." });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
  };

  const handleStartBatchExtraction = () => {
    if (selectedSiteIds.size === 0) {
      toast({ title: "No sites selected", description: "Select at least one site to extract.", variant: "destructive" });
      return;
    }
    batchExtractMutation.mutate(Array.from(selectedSiteIds));
  };

  return (
    <PageWrapper>
      {!expandedSite && (
        <motion.div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4" data-testid="extraction-dashboard" variants={staggerContainer} initial="hidden" animate="visible">
          {[
            { icon: FolderOpen, label: "Total Sites", value: totalSites, borderCls: "border-l-blue-500", iconBg: "bg-blue-500/10", iconCls: "text-blue-500", valueCls: "", testId: "text-total-sites" },
            { icon: CheckCircle2, label: "Extracted", value: extractedCount, borderCls: "border-l-emerald-500", iconBg: "bg-emerald-500/10", iconCls: "text-emerald-500", valueCls: "text-emerald-600", testId: "text-extracted-count" },
            { icon: Clock, label: "Not Extracted", value: notExtractedCount, borderCls: "border-l-orange-500", iconBg: "bg-orange-500/10", iconCls: "text-orange-500", valueCls: "text-orange-600", testId: "text-not-extracted-count" },
          ].map((stat, i) => (
            <motion.div key={stat.label} variants={fadeSlideUp} whileHover={{ y: -3, transition: { duration: 0.2 } }}>
              <Card className={`border-l-4 ${stat.borderCls} shadow-lg backdrop-blur-sm`}>
                <CardContent className="p-3 sm:p-5">
                  <div className="flex items-center gap-3">
                    <motion.div
                      className={`p-2 sm:p-2.5 rounded-xl ${stat.iconBg} shrink-0`}
                      animate={{ rotate: [0, 3, -3, 0] }}
                      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: i * 0.5 }}
                    >
                      <stat.icon className={`h-4 w-4 sm:h-5 sm:w-5 ${stat.iconCls}`} />
                    </motion.div>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
                      <p className={`text-xl sm:text-2xl font-bold ${stat.valueCls}`} data-testid={stat.testId}>{stat.value}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      {!expandedSite ? (
        <PageHeader
          icon={<FileSearch className="h-6 w-6 text-white" />}
          title="Extractions"
          subtitle="View and manage tag extraction results by site"
          accentGradient="from-[#0369a1] via-[#075985] to-[#0c4a6e]"
        >
          <div className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                className="bg-white/15 backdrop-blur-sm border border-white/25 text-white hover:bg-white/25 shadow-lg"
                onClick={handleExport}
                disabled={!extractions?.some((e) => e.status === "completed")}
                data-testid="button-export-excel"
              >
                <Download className="h-4 w-4 mr-2" />
                Export Excel
              </Button>
            </motion.div>
          </div>
        </PageHeader>
      ) : (
        <motion.div variants={fadeSlideUp} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div whileHover={{ x: -3 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" onClick={() => setExpandedSite(null)} data-testid="button-back-sites">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </motion.div>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold tracking-tight truncate" data-testid="text-extractions-title">
                {expandedSite}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {currentSiteGroup?.totalCount} lease extraction{currentSiteGroup?.totalCount !== 1 ? "s" : ""}
              </p>
            </div>
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
              disabled={!extractions?.some((e) => e.status === "completed")}
              data-testid="button-export-excel"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </motion.div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      ) : expandedSite ? (
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
                  const { found, missing, errors } = getTagCounts(ext.results as any);
                  const totalExpected = totalTagCount;
                  const successRate = totalExpected > 0 && ext.status === "completed" ? Math.round((found / totalExpected) * 100) : 0;
                  const isSelected = selectedIds.has(ext.id);
                  const hasErrors = errors > 0;

                  return (
                    <Card
                      key={ext.id}
                      className={`relative overflow-hidden transition-colors hover:border-primary/40 ${isSelected ? "ring-2 ring-primary border-primary" : ""} ${hasErrors ? "bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-700" : ""}`}
                      data-testid={`card-extraction-${ext.id}`}
                    >
                      {ext.status === "completed" && !hasErrors && (
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-emerald-500 transition-all"
                          style={{ width: `${successRate}%` }}
                        />
                      )}
                      {ext.status === "completed" && hasErrors && (
                        <div className="absolute bottom-0 left-0 h-1 bg-red-500 w-full" />
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
                                {hasErrors && (
                                  <AlertTriangle className="h-4 w-4 text-red-500" />
                                )}
                              </CardTitle>
                            </div>
                          </div>
                          {hasErrors ? (
                            <Badge className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/10">
                              <AlertTriangle className="h-3 w-3 mr-1" />
                              Errors
                            </Badge>
                          ) : (
                            getStatusBadge(ext.status)
                          )}
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
                            <div className={`grid ${errors > 0 ? "grid-cols-3" : "grid-cols-2"} gap-3`}>
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
                              {errors > 0 && (
                                <div className="flex items-center gap-2 p-2.5 rounded-md bg-red-500/10 border border-red-300 dark:border-red-700">
                                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                                  <div>
                                    <p className="text-lg font-bold text-red-600" data-testid={`text-errors-${ext.id}`}>{errors}</p>
                                    <p className="text-xs text-red-600/70">Errors</p>
                                  </div>
                                </div>
                              )}
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
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList data-testid="tabs-extraction-status">
            <TabsTrigger value="not-extracted" data-testid="tab-not-extracted">
              Not Extracted ({notExtractedCount})
            </TabsTrigger>
            <TabsTrigger value="extracted" data-testid="tab-extracted">
              Extracted ({extractedCount})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="not-extracted" className="space-y-4">
            {notExtractedSites.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <CheckCircle2 className="h-16 w-16 text-emerald-500/30 mb-4" />
                  <h3 className="text-lg font-medium mb-1">All sites extracted</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    Every uploaded site has been processed. Check the Extracted tab for results.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-4 p-4 bg-muted/50 rounded-lg border">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Sites to extract</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={notExtractedSites.length}
                        value={batchCount}
                        onChange={(e) => {
                          const val = Math.max(1, Math.min(notExtractedSites.length, parseInt(e.target.value) || 1));
                          setBatchCount(val);
                        }}
                        className="w-24"
                        data-testid="input-batch-count"
                      />
                      <span className="text-sm text-muted-foreground">of {notExtractedSites.length} sites</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium">Model</label>
                    <ModelSelector value={currentModel} onChange={(v) => setModelOverrides(v)} />
                  </div>
                  <Button
                    onClick={handleStartBatchExtraction}
                    disabled={selectedSiteIds.size === 0 || batchExtractMutation.isPending}
                    data-testid="button-start-batch-extraction"
                  >
                    {batchExtractMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Extract {selectedSiteIds.size} Site{selectedSiteIds.size !== 1 ? "s" : ""}
                  </Button>
                </div>

                {activeProgress.size > 0 && Array.from(activeProgress.values()).map((prog) => (
                  <Card key={prog.taskId} className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{prog.message || "Extracting..."}</p>
                          {prog.current !== undefined && prog.total !== undefined && prog.total > 0 && (
                            <div className="mt-2">
                              <div className="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-blue-500 rounded-full transition-all"
                                  style={{ width: `${(prog.current / prog.total) * 100}%` }}
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                {prog.current} / {prog.total}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {notExtractedSites.map((site) => {
                    const isSelected = selectedSiteIds.has(site.id);
                    return (
                      <Card
                        key={site.id}
                        className={`transition-all cursor-pointer hover:border-primary/40 ${isSelected ? "ring-2 ring-primary border-primary bg-primary/5" : ""}`}
                        onClick={() => toggleSiteSelect(site.id)}
                        data-testid={`card-not-extracted-${site.siteId}`}
                      >
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSiteSelect(site.id)}
                                className="mt-0.5"
                                onClick={(e) => e.stopPropagation()}
                                data-testid={`checkbox-site-${site.id}`}
                              />
                              <div className="flex items-center gap-3">
                                <div className="p-2 rounded-md bg-orange-500/10">
                                  <Building2 className="h-5 w-5 text-orange-500" />
                                </div>
                                <div>
                                  <h3 className="font-semibold text-base" data-testid={`text-site-name-${site.siteId}`}>
                                    {site.siteId}
                                  </h3>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {(site as SiteWithStatus).leaseCount} lease{(site as SiteWithStatus).leaseCount !== 1 ? "s" : ""} · {(site as SiteWithStatus).fileCount} file{(site as SiteWithStatus).fileCount !== 1 ? "s" : ""}
                                  </p>
                                </div>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs gap-1 border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-950/30 dark:text-orange-400">
                              <Clock className="h-3 w-3" />
                              Pending
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="extracted" className="space-y-4">
            {statusCounts && Object.keys(statusCounts).length > 0 && (
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

            {siteGroups.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <FileSearch className="h-16 w-16 text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-1">No extractions found</h3>
                  <p className="text-sm text-muted-foreground text-center max-w-sm">
                    {search || statusFilter
                      ? "No extractions match your filters."
                      : "Start extracting tags from the Not Extracted tab or from the Site Explorer."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {siteGroups.map((group) => {
                  const allCompleted = group.completedCount === group.totalCount;
                  let cardBg = "";
                  if (group.hasError) {
                    cardBg = "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700";
                  } else if (allCompleted) {
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
                            <div className={`p-2 rounded-md ${group.hasError ? "bg-red-100 dark:bg-red-900/40" : allCompleted ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-primary/10"}`}>
                              {group.hasError ? (
                                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                              ) : (
                                <Building2 className={`h-5 w-5 ${allCompleted ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} />
                              )}
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
                          {group.completedCount > 0 && !group.hasError && (
                            <Badge variant="outline" className="text-xs gap-1 border-emerald-300 text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30">
                              <CheckCircle2 className="h-3 w-3" />
                              {group.completedCount} completed
                            </Badge>
                          )}
                          {group.hasError && (
                            <Badge variant="outline" className="text-xs gap-1 border-red-300 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30">
                              <AlertTriangle className="h-3 w-3" />
                              Has errors
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

                        {!group.hasError && allCompleted && (
                          <div className="mt-3 h-1.5 bg-emerald-200 dark:bg-emerald-800 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: "100%" }} />
                          </div>
                        )}
                        {!group.hasError && group.hasCompleted && !allCompleted && (
                          <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(group.completedCount / group.totalCount) * 100}%` }} />
                          </div>
                        )}
                        {group.hasError && (
                          <div className="mt-3 h-1.5 bg-red-200 dark:bg-red-800 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 rounded-full" style={{ width: "100%" }} />
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
            )}
          </TabsContent>
        </Tabs>
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
                    const aError = a && a.toLowerCase().includes("extraction error");
                    const bError = b && b.toLowerCase().includes("extraction error");
                    if (aError && !bError) return -1;
                    if (!aError && bError) return 1;
                    const aFound = a && a !== "Not Found" && a.trim() !== "";
                    const bFound = b && b !== "Not Found" && b.trim() !== "";
                    if (aFound && !bFound) return -1;
                    if (!aFound && bFound) return 1;
                    return 0;
                  })
                  .map(([tag, value]) => {
                    const isError = value && value.toLowerCase().includes("extraction error");
                    const isFound = !isError && value && value !== "Not Found" && value.trim() !== "";
                    return (
                      <div
                        key={tag}
                        className={`flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-3 rounded-md ${
                          isError
                            ? "bg-red-500/10 border border-red-500/30"
                            : isFound
                              ? "bg-emerald-500/5 border border-emerald-500/10"
                              : "bg-red-500/5 border border-red-500/10"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-[200px]">
                          {isError ? (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                          ) : isFound ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <span className={`text-sm font-medium ${isError ? "text-red-600" : "text-muted-foreground"}`}>{tag}</span>
                        </div>
                        <span className={`text-sm flex-1 ${isError ? "text-red-600 font-medium" : ""}`}>
                          {isError ? value : isFound ? value : "Not Found"}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}