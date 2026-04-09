import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useProgress } from "@/hooks/use-progress";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Link } from "wouter";
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
import {
  Building2,
  Upload,
  FolderOpen,
  ScrollText,
  FileText,
  Search,
  ArrowRight,
  Loader2,
  Play,
  X,
  Trash2,
  CheckCircle2,
  AlertCircle,
  IndianRupee,
} from "lucide-react";
import type { Site } from "@shared/schema";
import { ModelSelector, useDefaultExtractionOverrides, type ExtractionOverrides } from "@/components/model-selector";

interface SiteCost {
  siteId: number;
  siteName: string;
  totalInr: number;
  extractionInr: number;
}

function formatInr(value: number): string {
  if (value < 0.01) return "₹0.00";
  return "₹" + value.toFixed(2);
}

interface SiteWithCounts extends Site {
  leaseCount: number;
  fileCount: number;
  extractionStatus: string;
}

export default function SiteExplorer() {
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadTotalFiles, setUploadTotalFiles] = useState(0);
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; name: string } | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaults = useDefaultExtractionOverrides();
  const [extractionOverrides, setExtractionOverrides] = useState<ExtractionOverrides | null>(null);
  const overrides = extractionOverrides || defaults;
  const { toast } = useToast();
  const refreshAfterTask = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
    queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
    queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
  }, []);
  const { activeProgress, trackTask } = useProgress(refreshAfterTask);

  const { data: sites, isLoading } = useQuery<SiteWithCounts[]>({
    queryKey: ["/api/sites"],
    refetchInterval: 10000,
  });

  const { data: siteCosts } = useQuery<SiteCost[]>({
    queryKey: ["/api/costs/by-site"],
    refetchInterval: 10000,
  });

  const siteCostMap = new Map(siteCosts?.map((c) => [c.siteName, c]) ?? []);

  const handleFolderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadTotalFiles(files.length);

    const BATCH_SIZE = 500;
    const totalFiles = files.length;
    const rawList: { file: File; path: string }[] = [];
    for (let i = 0; i < totalFiles; i++) {
      const file = files[i];
      const relativePath = (file as any).webkitRelativePath || file.name;
      rawList.push({ file, path: relativePath });
    }

    const minDepth = Math.min(...rawList.map(f => f.path.split("/").filter(Boolean).length));
    const shouldStripRoot = minDepth >= 4;
    const fileList = rawList.map(f => {
      if (shouldStripRoot) {
        const parts = f.path.split("/").filter(Boolean);
        return { file: f.file, path: parts.slice(1).join("/") };
      }
      return f;
    });

    try {
      const totalBatches = Math.ceil(fileList.length / BATCH_SIZE);
      let filesUploaded = 0;
      let totalDuplicatesSkipped = 0;
      let totalFilesCreated = 0;
      const batchTaskIds: string[] = [];

      for (let batch = 0; batch < totalBatches; batch++) {
        const start = batch * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, fileList.length);
        const batchFiles = fileList.slice(start, end);

        const formData = new FormData();
        for (const item of batchFiles) {
          formData.append("files", item.file);
          formData.append("paths", item.path);
        }

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const batchProgress = e.loaded / e.total;
              const overallProgress = (filesUploaded + batchProgress * batchFiles.length) / totalFiles;
              setUploadProgress(Math.round(overallProgress * 100));
            }
          });
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const resData = JSON.parse(xhr.responseText);
                if (resData.taskId) batchTaskIds.push(resData.taskId);
                if (resData.skippedDuplicates) totalDuplicatesSkipped += resData.skippedDuplicates;
                if (resData.filesCreated) totalFilesCreated += resData.filesCreated;
              } catch {}
              resolve();
            } else {
              try {
                const errData = JSON.parse(xhr.responseText);
                reject(new Error(errData.message || "Upload failed"));
              } catch {
                reject(new Error("Upload failed"));
              }
            }
          };
          xhr.onerror = () => reject(new Error("Network error during upload"));
          xhr.open("POST", "/api/upload-folder");
          xhr.send(formData);
        });

        filesUploaded += batchFiles.length;
        setUploadProgress(Math.round((filesUploaded / totalFiles) * 100));
      }

      const dupMsg = totalDuplicatesSkipped > 0 ? `, ${totalDuplicatesSkipped} duplicate(s) skipped` : "";
      toast({ title: "Folder uploaded successfully", description: `${totalFilesCreated} file(s) uploaded${dupMsg}.` });
      for (const tid of batchTaskIds) {
        trackTask(tid);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const batchExtractMutation = useMutation({
    mutationFn: async (siteIds: number[]) => {
      const res = await apiRequest("POST", "/api/extractions/start-sites", {
        siteIds,
        model: overrides.model,
        baseUrl: overrides.baseUrl,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Batch extraction started",
        description: `Started extraction for ${data.started} lease(s) across ${selectedSites.size} site(s)${data.skipped > 0 ? `, ${data.skipped} already in progress` : ""}.`,
      });
      if (data.leaseTaskIds) {
        for (const taskId of Object.values(data.leaseTaskIds) as string[]) {
          trackTask(taskId);
        }
      }
      setSelectedSites(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
    },
    onError: (err: any) => {
      toast({ title: "Batch extraction failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sites/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Site deleted", description: "The site and all its data have been removed." });
      setSelectedSites((prev) => {
        const n = new Set(prev);
        n.delete(deleteConfirm?.id ?? 0);
        return n;
      });
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete site", description: err.message, variant: "destructive" });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/sites");
    },
    onSuccess: () => {
      toast({ title: "All sites deleted", description: "All sites and their data have been permanently removed." });
      setSelectedSites(new Set());
      setDeleteAllConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/sites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/costs/by-site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/extractions"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete all sites", description: err.message, variant: "destructive" });
    },
  });

  const toggleSiteSelection = (siteId: number) => {
    setSelectedSites((prev) => {
      const n = new Set(prev);
      if (n.has(siteId)) {
        n.delete(siteId);
      } else {
        n.add(siteId);
      }
      return n;
    });
  };

  const toggleSelectAll = () => {
    if (!filteredSites) return;
    if (selectedSites.size === filteredSites.length) {
      setSelectedSites(new Set());
    } else {
      setSelectedSites(new Set(filteredSites.map((s) => s.id)));
    }
  };

  const filteredSites = sites?.filter((s) =>
    s.siteId.toLowerCase().includes(search.toLowerCase())
  );

  const allSelected = filteredSites && filteredSites.length > 0 && selectedSites.size === filteredSites.length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-sites-title">
            Site Explorer
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Browse and manage your lease document folders
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            {...{ webkitdirectory: "", directory: "", mozdirectory: "" } as any}
            onChange={handleFolderUpload}
            data-testid="input-folder-upload"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            data-testid="button-upload-folder"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {uploading ? "Uploading..." : "Upload Folder"}
          </Button>
          {sites && sites.length > 0 && (
            <Button
              variant="destructive"
              onClick={() => setDeleteAllConfirm(true)}
              disabled={uploading}
              data-testid="button-delete-all-sites"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete All Sites
            </Button>
          )}
        </div>
      </div>

      {uploading && (
        <Card data-testid="card-upload-progress" className="border-primary/30">
          <CardContent className="p-5">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
                  <Upload className="h-5 w-5 text-primary animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">Uploading {uploadTotalFiles} file(s)</p>
                  <p className="text-xs text-muted-foreground">Sending files to server — please wait...</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary" data-testid="text-upload-percent">{uploadProgress}%</p>
                </div>
              </div>
              <Progress value={uploadProgress} className="h-3" />
            </div>
          </CardContent>
        </Card>
      )}

      {Array.from(activeProgress.values()).map((progress) => {
        const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
        const isDone = progress.status === "completed";
        const isFailed = progress.status === "failed" || progress.status === "error";
        const borderClass = isDone ? "border-emerald-500/30" : isFailed ? "border-destructive/30" : "border-primary/30";
        const iconBg = isDone ? "bg-emerald-500/10" : isFailed ? "bg-destructive/10" : "bg-primary/10";

        return (
          <Card key={progress.taskId} data-testid={`card-progress-${progress.taskId}`} className={borderClass}>
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

      {selectedSites.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className="text-sm">
                  {selectedSites.size} site{selectedSites.size !== 1 ? "s" : ""} selected
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedSites(new Set())}
                  data-testid="button-clear-selection"
                >
                  <X className="h-3 w-3 mr-1" /> Clear
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <ModelSelector
                  value={overrides}
                  onChange={(v) => setExtractionOverrides(v)}
                />
                <Button
                  onClick={() => batchExtractMutation.mutate(Array.from(selectedSites))}
                  disabled={batchExtractMutation.isPending}
                  data-testid="button-extract-selected"
                >
                  {batchExtractMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4 mr-2" />
                  )}
                  {batchExtractMutation.isPending ? "Extracting..." : "Extract Selected Sites"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sites..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-sites"
          />
        </div>
        {filteredSites && filteredSites.length > 0 && (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={allSelected || false}
              onCheckedChange={toggleSelectAll}
              data-testid="checkbox-select-all"
            />
            <span className="text-sm text-muted-foreground">Select all</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : !filteredSites || filteredSites.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FolderOpen className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-1">No sites found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {search
                ? "No sites match your search. Try a different term."
                : "Upload your root folder containing Site ID subfolders, each with Lease Number subfolders containing documents. You can also upload individual Site ID folders one at a time."}
            </p>
            {!search && (
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-empty"
              >
                <Upload className="h-4 w-4 mr-2" />
                Upload Folder
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSites.map((site) => {
            const isSelected = selectedSites.has(site.id);
            const isExtracted = site.extractionStatus === "completed";
            const isPartial = site.extractionStatus === "partial";
            let cardClass = "transition-all shadow-sm ";
            if (isSelected) {
              cardClass += "ring-2 ring-primary border-primary bg-primary/[0.02]";
            } else if (isExtracted) {
              cardClass += "bg-emerald-50/80 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 hover-elevate";
            } else if (isPartial) {
              cardClass += "bg-amber-50/50 dark:bg-amber-950/15 border-amber-200/70 dark:border-amber-800/50 hover-elevate";
            } else {
              cardClass += "hover-elevate";
            }
            return (
            <Card
              key={site.id}
              className={cardClass}
              data-testid={`card-site-${site.id}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSiteSelection(site.id)}
                      data-testid={`checkbox-site-${site.id}`}
                    />
                  </div>
                  <Link href={`/sites/${site.id}`} className="flex-1 cursor-pointer">
                    <div className="flex items-start justify-between gap-2 mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-md ${isExtracted ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-primary/10"}`}>
                          <Building2 className={`h-5 w-5 ${isExtracted ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-base" data-testid={`text-site-id-${site.id}`}>
                            {site.siteId}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Added {new Date(site.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground mt-1" />
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <ScrollText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {site.leaseCount} lease{site.leaseCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {site.fileCount} file{site.fileCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                      {isExtracted && (
                        <Badge variant="outline" className="text-xs gap-1 border-emerald-400 text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40" data-testid={`badge-extracted-${site.id}`}>
                          <CheckCircle2 className="h-3 w-3" />
                          Extracted
                        </Badge>
                      )}
                      {isPartial && (
                        <Badge variant="outline" className="text-xs gap-1 border-amber-300 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30" data-testid={`badge-partial-${site.id}`}>
                          <AlertCircle className="h-3 w-3" />
                          Partial
                        </Badge>
                      )}
                      {(() => {
                        const cost = siteCostMap.get(site.siteId);
                        if (!cost || cost.totalInr === 0) return null;
                        return (
                          <span className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" data-testid={`text-cost-site-${site.id}`}>
                            <IndianRupee className="h-3 w-3" />
                            <span className="font-medium">{formatInr(cost.totalInr)}</span>
                          </span>
                        );
                      })()}
                    </div>
                  </Link>
                  <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteConfirm({ id: site.id, name: site.siteId })}
                      data-testid={`button-delete-site-${site.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Site</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete site "{deleteConfirm?.name}"? This will permanently remove the site and all its leases, files, and extraction results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllConfirm} onOpenChange={setDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Sites</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete ALL {sites?.length || 0} sites? This will permanently remove every site along with all their leases, files, and extraction results. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-all"
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete All Sites
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
