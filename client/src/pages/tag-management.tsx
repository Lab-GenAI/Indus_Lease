import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { PageWrapper, PageHeader, AnimatedCard } from "@/components/motion-primitives";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
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
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Plus,
  Upload,
  Trash2,
  Tags,
  Search,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Download,
} from "lucide-react";
import type { Tag } from "@shared/schema";

const tagFormSchema = z.object({
  name: z.string().min(1, "Tag name is required"),
  description: z.string().optional(),
  category: z.string().optional(),
});

type TagFormValues = z.infer<typeof tagFormSchema>;

export default function TagManagement() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: tags, isLoading } = useQuery<Tag[]>({
    queryKey: ["/api/tags"],
  });

  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: "", description: "", category: "" },
  });

  const createMutation = useMutation({
    mutationFn: async (values: TagFormValues) => {
      const res = await apiRequest("POST", "/api/tags", values);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tag created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
      setDialogOpen(false);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create tag", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...values }: TagFormValues & { id: number }) => {
      const res = await apiRequest("PATCH", `/api/tags/${id}`, values);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Tag updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      setDialogOpen(false);
      setEditingTag(null);
      form.reset();
    },
    onError: (err: any) => {
      toast({ title: "Failed to update tag", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/tags/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Tag deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete tag", description: err.message, variant: "destructive" });
    },
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/tags");
    },
    onSuccess: () => {
      toast({ title: "All tags deleted", description: "All extraction tags have been permanently removed." });
      setDeleteAllConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete all tags", description: err.message, variant: "destructive" });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/tags/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Tags imported",
        description: `${data.imported} tags imported successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/stats"] });
    },
    onError: (err: any) => {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    },
  });

  const handleSubmit = (values: TagFormValues) => {
    if (editingTag) {
      updateMutation.mutate({ ...values, id: editingTag.id });
    } else {
      createMutation.mutate(values);
    }
  };

  const openEditDialog = (tag: Tag) => {
    setEditingTag(tag);
    form.reset({
      name: tag.name,
      description: tag.description || "",
      category: tag.category || "",
    });
    setDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingTag(null);
    form.reset({ name: "", description: "", category: "" });
    setDialogOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadMutation.mutate(file);
      e.target.value = "";
    }
  };

  const filteredTags = tags?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      (t.category && t.category.toLowerCase().includes(search.toLowerCase()))
  );

  const categories = Array.from(new Set(tags?.map((t) => t.category).filter(Boolean) || []));

  return (
    <PageWrapper className="p-6 space-y-6 max-w-6xl mx-auto">
      <PageHeader
        icon={<Tags className="h-6 w-6 text-white" />}
        title="Tag Management"
        subtitle="Configure extraction tags for your lease documents"
        accentGradient="from-[#6b21a8] via-[#581c87] to-[#3b0764]"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFileUpload}
            data-testid="input-excel-upload"
          />
          <Button
            variant="outline"
            asChild
            data-testid="button-download-tags"
          >
            <a href="/api/tags/export" download>
              <Download className="h-4 w-4 mr-2" />
              Download Tags
            </a>
          </Button>
          <Button
            variant="outline"
            asChild
            data-testid="button-download-template"
          >
            <a href="/api/tags/template" download>
              <Download className="h-4 w-4 mr-2" />
              Template
            </a>
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-upload-excel"
          >
            {uploadMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4 mr-2" />
            )}
            Import Excel
          </Button>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
            <Button onClick={openCreateDialog} className="bg-white/15 backdrop-blur-sm border border-white/25 text-white hover:bg-white/25 shadow-lg" data-testid="button-add-tag">
              <Plus className="h-4 w-4 mr-2" />
              Add Tag
            </Button>
          </motion.div>
          {tags && tags.length > 0 && (
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button
                variant="destructive"
                onClick={() => setDeleteAllConfirm(true)}
                data-testid="button-delete-all-tags"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All Tags
              </Button>
            </motion.div>
          )}
        </div>
      </PageHeader>

      {categories.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Categories:</span>
          {categories.map((cat) => (
            <Badge
              key={cat}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => setSearch(cat!)}
            >
              {cat}
            </Badge>
          ))}
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")}>
              Clear
            </Button>
          )}
        </div>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search tags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-search-tags"
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : !filteredTags || filteredTags.length === 0 ? (
        <AnimatedCard>
        <Card className="shadow-lg border-white/10 dark:border-white/5 backdrop-blur-sm">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Tags className="h-16 w-16 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-1">No tags found</h3>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              {search
                ? "No tags match your search."
                : "Add extraction tags individually or import them from an Excel file."}
            </p>
            {!search && (
              <div className="flex gap-2 mt-4">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Import Excel
                </Button>
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" /> Add Tag
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
        </AnimatedCard>
      ) : (
        <AnimatedCard>
        <Card className="shadow-lg border-white/10 dark:border-white/5 backdrop-blur-sm overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTags.map((tag) => (
                  <TableRow key={tag.id} data-testid={`row-tag-${tag.id}`}>
                    <TableCell>
                      <span className="font-medium" data-testid={`text-tag-name-${tag.id}`}>
                        {tag.name}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm text-muted-foreground">
                        {tag.description || "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      {tag.category ? (
                        <Badge variant="secondary">{tag.category}</Badge>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(tag)}
                          data-testid={`button-edit-tag-${tag.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(tag.id)}
                          data-testid={`button-delete-tag-${tag.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        </AnimatedCard>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "Add New Tag"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tag Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Lease Start Date"
                        {...field}
                        data-testid="input-tag-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What this tag extracts..."
                        {...field}
                        data-testid="input-tag-description"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Financial, Legal, Dates"
                        {...field}
                        data-testid="input-tag-category"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-tag"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  {editingTag ? "Update Tag" : "Create Tag"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAllConfirm} onOpenChange={setDeleteAllConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete All Tags</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete ALL {tags?.length || 0} extraction tags? This action cannot be undone. You will need to re-create or re-import tags before running extractions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-all-tags">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAllMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-all-tags"
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete All Tags
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageWrapper>
  );
}
