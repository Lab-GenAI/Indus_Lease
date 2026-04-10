import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PdfViewer } from "@/components/pdf-viewer";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { PageWrapper, fadeSlideUp, staggerContainer } from "@/components/motion-primitives";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useProgress } from "@/hooks/use-progress";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Progress } from "@/components/ui/progress";
import {
  ChevronLeft,
  Building2,
  ScrollText,
  FileText,
  Play,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
  File,
  FileType,
  X,
  IndianRupee,
} from "lucide-react";
import type { Site, Lease, LeaseFile, Extraction } from "@shared/schema";
import { ModelSelector, useDefaultExtractionOverrides, type ExtractionOverrides } from "@/components/model-selector";

interface LeaseCost {
  leaseId: number;
  leaseNumber: string;
  totalInr: number;
  totalUsd: number;
  extractionInr: number;
}

function formatInr(value: number): string {
  if (value < 0.01) return "₹0.00";
  return "₹" + value.toFixed(2);
}

interface LeaseWithDetails extends Lease {
  files: LeaseFile[];
  extraction?: Extraction | null;
}

interface SiteDetailData extends Site {
  leases: LeaseWithDetails[];
}

function getFileIcon(type: string) {
  switch (type.toLowerCase()) {
    case "pdf":
      return <FileType className="h-4 w-4 text-red-500" />;
    case "docx":
      return <FileText className="h-4 w-4 text-blue-500" />;
    case "msg":
    case "eml":
      return <File className="h-4 w-4 text-amber-500" />;
    default:
      return <File className="h-4 w-4 text-muted-foreground" />;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "completed":
      return (
        <Badge variant="default" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
        </Badge>
      );
    case "processing":
      return (
        <Badge variant="secondary">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
        </Badge>
      );
    case "failed":
      return (
        <Badge variant="destructive">
          <AlertCircle className="h-3 w-3 mr-1" /> Failed
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          <Clock className="h-3 w-3 mr-1" /> Pending
        </Badge>
      );
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SiteDetail() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const refreshAfterExtraction = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/sites", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
    queryClient.invalidateQueries({ queryKey: ["/api/costs/by-lease", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
  }, [id]);
  const { activeProgress, trackTask } = useProgress(refreshAfterExtraction);
  const [selectedExtraction, setSelectedExtraction] = useState<Extraction | null>(null);
  const [extractingLeases, setExtractingLeases] = useState<Set<number>>(new Set());
  const [extractingAll, setExtractingAll] = useState(false);
  const [previewFile, setPreviewFile] = useState<LeaseFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const defaults = useDefaultExtractionOverrides();
  const [extractionOverrides, setExtractionOverrides] = useState<ExtractionOverrides | null>(null);
  const overrides = extractionOverrides || defaults;

  const { data: site, isLoading } = useQuery<SiteDetailData>({
    queryKey: ["/api/sites", id],
  });

  const { data: leaseCosts } = useQuery<LeaseCost[]>({
    queryKey: ["/api/costs/by-lease", id],
    queryFn: async () => {
      if (!id) return [];
      const res = await fetch(`/api/costs/by-lease/${id}`);
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!id,
  });

  const leaseCostMap = new Map(
    Array.isArray(leaseCosts) ? leaseCosts.map((c) => [c.leaseId, c]) : []
  );

  const extractMutation = useMutation({
    mutationFn: async (leaseId: number) => {
      setExtractingLeases((prev) => new Set(prev).add(leaseId));
      const res = await apiRequest("POST", `/api/extractions/start/${leaseId}`, {
        model: overrides.model,
        baseUrl: overrides.baseUrl,
      });
      return res.json();
    },
    onSuccess: (data: any, leaseId) => {
      toast({ title: "Extraction started", description: "Tag extraction is in progress." });
      if (data.taskId) {
        trackTask(data.taskId);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sites", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-lease", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
      setExtractingLeases((prev) => {
        const n = new Set(prev);
        n.delete(leaseId);
        return n;
      });
    },
    onError: (err: any, leaseId) => {
      toast({ title: "Extraction failed", description: err.message, variant: "destructive" });
      setExtractingLeases((prev) => {
        const n = new Set(prev);
        n.delete(leaseId);
        return n;
      });
    },
  });

  const extractAllMutation = useMutation({
    mutationFn: async (siteId: number) => {
      setExtractingAll(true);
      const res = await apiRequest("POST", `/api/extractions/start-site/${siteId}`, {
        model: overrides.model,
        baseUrl: overrides.baseUrl,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Site extraction started",
        description: `Started extraction for ${data.started} lease(s)${data.skipped > 0 ? `, ${data.skipped} already in progress` : ""}.`,
      });
      if (data.leaseTaskIds) {
        for (const taskId of Object.values(data.leaseTaskIds) as string[]) {
          trackTask(taskId);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sites", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-lease", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
      setExtractingAll(false);
    },
    onError: (err: any) => {
      toast({ title: "Site extraction failed", description: err.message, variant: "destructive" });
      setExtractingAll(false);
    },
  });

  const handlePreviewFile = async (file: LeaseFile) => {
    setPreviewFile(file);
    setPreviewContent(null);
    setPreviewLoading(true);

    const ext = file.fileType.toLowerCase();

    if (ext === "pdf") {
      setPreviewLoading(false);
      return;
    }

    if (ext === "msg" || ext === "eml") {
      try {
        const res = await fetch(`/api/files/${file.id}/preview`);
        if (!res.ok) throw new Error("Failed to load email preview");
        const html = await res.text();
        setPreviewContent(html);
      } catch (err: any) {
        setPreviewContent("<p>Unable to load email content.</p>");
      } finally {
        setPreviewLoading(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/files/${file.id}/content`);
      if (!res.ok) throw new Error("Failed to load file content");
      const data = await res.json();
      setPreviewContent(data.content);
    } catch (err: any) {
      setPreviewContent("Unable to load file content.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClosePreview = () => {
    setPreviewFile(null);
    setPreviewContent(null);
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!site) {
    return (
      <div className="p-6 flex flex-col items-center justify-center py-16">
        <p className="text-muted-foreground">Site not found</p>
        <Link href="/sites">
          <Button variant="outline" className="mt-4">
            <ChevronLeft className="h-4 w-4 mr-1" /> Back to Sites
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <PageWrapper className="p-6 space-y-6 max-w-6xl mx-auto">
      <motion.div variants={fadeSlideUp} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/sites">
            <motion.div whileHover={{ x: -3 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" data-testid="button-back-sites">
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </motion.div>
          </Link>
          <div className="flex items-center gap-3">
            <motion.div
              className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10"
              animate={{ rotate: [0, 3, -3, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Building2 className="h-5 w-5 text-primary" />
            </motion.div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight" data-testid="text-site-detail-title">
                {site.siteId}
              </h1>
              <p className="text-sm text-muted-foreground">
                {site.leases.length} lease{site.leases.length !== 1 ? "s" : ""} ·{" "}
                {site.leases.reduce((acc, l) => acc + l.files.length, 0)} total files
              </p>
            </div>
          </div>
        </div>
        {site.leases.length > 0 && (
          <div className="flex items-center gap-3">
            <ModelSelector
              value={overrides}
              onChange={(v) => setExtractionOverrides(v)}
            />
            <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
              <Button
                onClick={() => extractAllMutation.mutate(site.id)}
                disabled={extractingAll}
                data-testid="button-extract-all-site"
              >
                {extractingAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                {extractingAll ? "Extracting..." : "Extract All Leases"}
              </Button>
            </motion.div>
          </div>
        )}
      </motion.div>

      {activeProgress.size > 0 && (
        <div className="space-y-2">
          {Array.from(activeProgress.values()).map((progress) => {
            const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
            const isDone = progress.status === "completed";
            const isFailed = progress.status === "failed" || progress.status === "error";
            const borderClass = isDone ? "border-emerald-500/30" : isFailed ? "border-destructive/30" : "border-primary/30";
            const iconBg = isDone ? "bg-emerald-500/10" : isFailed ? "bg-destructive/10" : "bg-primary/10";

            return (
              <Card key={progress.taskId} data-testid={`card-extraction-progress-${progress.taskId}`} className={borderClass}>
                <CardContent className="p-5">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center h-10 w-10 rounded-full ${iconBg}`}>
                        {isDone ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        ) : isFailed ? (
                          <AlertCircle className="h-5 w-5 text-destructive" />
                        ) : (
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm" data-testid={`text-progress-message-${progress.taskId}`}>{progress.message}</p>
                        {progress.detail && (
                          <p className="text-xs text-muted-foreground mt-0.5" data-testid={`text-progress-detail-${progress.taskId}`}>{progress.detail}</p>
                        )}
                      </div>
                      {progress.total > 0 && !isDone && (
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{pct}%</p>
                          <p className="text-[11px] text-muted-foreground">{progress.current}/{progress.total}</p>
                        </div>
                      )}
                    </div>
                    {progress.total > 0 && (
                      <Progress value={isDone ? 100 : pct} className="h-3" />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {site.leases.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ScrollText className="h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">No leases found for this site</p>
          </CardContent>
        </Card>
      ) : (
        <motion.div
          className="space-y-4"
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
        >
          {site.leases.map((lease, idx) => (
            <motion.div key={lease.id} variants={fadeSlideUp} whileHover={{ y: -2, transition: { duration: 0.2 } }}>
            <Card data-testid={`card-lease-${lease.id}`} className="shadow-lg border-white/10 dark:border-white/5 backdrop-blur-sm overflow-hidden relative">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-3">
                  <ScrollText className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base" data-testid={`text-lease-number-${lease.id}`}>
                      Lease: {lease.leaseNumber}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lease.files.length} file{lease.files.length !== 1 ? "s" : ""}
                      {(() => {
                        const cost = leaseCostMap.get(lease.id);
                        if (!cost || cost.totalInr === 0) return null;
                        return (
                          <span className="ml-2 inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                            <IndianRupee className="h-3 w-3" />
                            <span className="font-medium">{formatInr(cost.totalInr)}</span>
                          </span>
                        );
                      })()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {lease.extraction ? (
                    <>
                      {getStatusBadge(lease.extraction.status)}
                      {lease.extraction.status === "completed" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedExtraction(lease.extraction!)}
                          data-testid={`button-view-results-${lease.id}`}
                        >
                          <Eye className="h-3 w-3 mr-1" /> View Results
                        </Button>
                      )}
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => extractMutation.mutate(lease.id)}
                      disabled={extractingLeases.has(lease.id)}
                      data-testid={`button-extract-${lease.id}`}
                    >
                      {extractingLeases.has(lease.id) ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      Extract Tags
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lease.files.map((file) => (
                      <TableRow key={file.id} data-testid={`row-file-${file.id}`}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {getFileIcon(file.fileType)}
                            <span className="text-sm">{file.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="uppercase text-xs">
                            {file.fileType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatFileSize(file.fileSize)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePreviewFile(file)}
                            data-testid={`button-preview-file-${file.id}`}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            </motion.div>
          ))}
        </motion.div>
      )}

      <Dialog open={!!previewFile} onOpenChange={handleClosePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {previewFile && getFileIcon(previewFile.fileType)}
              {previewFile?.fileName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : previewFile?.fileType.toLowerCase() === "pdf" ? (
              <div className="h-[70vh]">
                <PdfViewer
                  url={`/api/files/${previewFile.id}/preview`}
                  fileName={previewFile.fileName}
                />
              </div>
            ) : previewFile && ["msg", "eml"].includes(previewFile.fileType.toLowerCase()) ? (
              <iframe
                srcDoc={previewContent || ""}
                className="w-full h-[70vh] rounded-md border"
                title={previewFile.fileName}
                sandbox="allow-same-origin"
                data-testid="iframe-file-preview"
              />
            ) : (
              <ScrollArea className="h-[70vh]">
                <pre className="whitespace-pre-wrap text-sm p-4 bg-muted/50 rounded-md font-mono leading-relaxed" data-testid="text-file-content">
                  {previewContent || "No content available."}
                </pre>
              </ScrollArea>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedExtraction} onOpenChange={() => setSelectedExtraction(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Extraction Results</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            {selectedExtraction?.results && (
              <div className="space-y-2 pr-4">
                {Object.entries(selectedExtraction.results).map(([tag, value]) => (
                  <div
                    key={tag}
                    className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 p-3 rounded-md bg-muted/50"
                  >
                    <span className="text-sm font-medium min-w-[180px] text-muted-foreground">
                      {tag}
                    </span>
                    <span className="text-sm flex-1">{value || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
