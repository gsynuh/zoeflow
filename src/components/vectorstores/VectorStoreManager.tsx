"use client";

import { useStore } from "@nanostores/react";
import { Database, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import SimpleBar from "simplebar-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { formatCost } from "@/lib/format";
import { $themeMode } from "@/stores/theme";
import { DocumentChunksDrawer } from "./DocumentChunksDrawer";

type VectorStoreInfo = {
  storeId: string;
  itemCount: number;
};

type DocumentInfo = {
  docId: string;
  storeId: string;
  sourceUri: string;
  description?: string;
  author?: string;
  tags?: string[];
  version: string;
  status: "pending" | "processing" | "completed" | "error" | "cancelled";
  error?: string;
  chunkCount?: number;
  uploadedAt: number;
  processedAt?: number;
  totalCost?: number;
  totalTokens?: number;
  processingStep?:
    | "normalizing"
    | "parsing"
    | "chunking"
    | "enriching"
    | "embedding"
    | "storing";
  progress?: {
    current: number;
    total: number;
    step: string;
  };
};

/**
 * Safely parse a fetch response as JSON, falling back to plain text when the
 * server returns a non-JSON payload (for example, an HTML error page).
 *
 * @param response - Fetch response to parse.
 */
async function readResponseJsonOrText(
  response: Response,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const data = (await response.json()) as unknown;
    return { ok: true, data };
  } catch {
    try {
      const text = await response.text();
      return {
        ok: false,
        error: text.trim().length > 0 ? text : "Non-JSON response from server.",
      };
    } catch {
      return { ok: false, error: "Failed to read server response." };
    }
  }
}

/**
 * Main component for managing vector stores and documents.
 */
export function VectorStoreManager() {
  const themeMode = useStore($themeMode);
  const [stores, setStores] = useState<VectorStoreInfo[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>("default");
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCancelling, setIsCancelling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newStoreId, setNewStoreId] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [docToDelete, setDocToDelete] = useState<DocumentInfo | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<DocumentInfo | null>(null);
  const [pendingMetadataDoc, setPendingMetadataDoc] =
    useState<DocumentInfo | null>(null);
  const [pendingAuthor, setPendingAuthor] = useState("");
  const [pendingDescription, setPendingDescription] = useState("");
  const [pendingTags, setPendingTags] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [editMetadataDoc, setEditMetadataDoc] = useState<DocumentInfo | null>(
    null,
  );
  const [editAuthor, setEditAuthor] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [reprocessDoc, setReprocessDoc] = useState<DocumentInfo | null>(null);
  const [isReprocessing, setIsReprocessing] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadStores = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/stores", {
        method: "GET",
      });

      if (!response.ok) {
        const parsed = await readResponseJsonOrText(response);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const maybeError = (parsed.data as { error?: unknown }).error;
          throw new Error(
            typeof maybeError === "string" && maybeError.trim()
              ? maybeError
              : "Failed to load stores",
          );
        }

        throw new Error(parsed.ok ? "Failed to load stores" : parsed.error);
      }

      const data = await response.json();
      setStores(data.stores ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, []);

  const loadDocuments = useCallback(async (storeId: string) => {
    setIsLoadingDocs(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/vectorstore/documents?storeId=${encodeURIComponent(storeId)}`,
        {
          method: "GET",
        },
      );

      if (!response.ok) {
        const parsed = await readResponseJsonOrText(response);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const maybeError = (parsed.data as { error?: unknown }).error;
          throw new Error(
            typeof maybeError === "string" && maybeError.trim()
              ? maybeError
              : "Failed to load documents",
          );
        }

        throw new Error(parsed.ok ? "Failed to load documents" : parsed.error);
      }

      const data = await response.json();
      setDocuments(data.documents ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoadingDocs(false);
    }
  }, []);

  useEffect(() => {
    loadStores();
  }, [loadStores]);

  // Apply theme mode to document element (same as GraphEditorLayout)
  useEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  useEffect(() => {
    if (selectedStoreId) {
      loadDocuments(selectedStoreId);
    }
  }, [selectedStoreId, loadDocuments]);

  // Use SSE for real-time updates when documents are processing
  useEffect(() => {
    if (!selectedStoreId) {
      return;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Create SSE connection for real-time updates
    const eventSource = new EventSource(
      `/api/v1/vectorstore/documents/events?storeId=${encodeURIComponent(selectedStoreId)}`,
    );

    eventSource.onmessage = (event) => {
      try {
        if (typeof event.data !== "string" || event.data.trim().length === 0) {
          return;
        }

        const data = JSON.parse(event.data);
        if (data.type === "status") {
          // Update document status optimistically
          setDocuments((prev) =>
            prev.map((doc) =>
              doc.docId === data.docId
                ? {
                    ...doc,
                    status: data.status,
                    processingStep: data.processingStep,
                    progress: data.progress,
                    chunkCount: data.chunkCount,
                    error:
                      typeof data.error === "string" ? data.error : doc.error,
                  }
                : doc,
            ),
          );
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    eventSource.onerror = () => {
      // SSE connection error - fallback to polling
      eventSource.close();
      if (pollingIntervalRef.current) return;
      const interval = setInterval(() => {
        loadDocuments(selectedStoreId);
      }, 2000);
      pollingIntervalRef.current = interval;
    };

    return () => {
      eventSource.close();
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [selectedStoreId, loadDocuments]);

  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || isUploading) return;

      setIsUploading(true);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("storeId", selectedStoreId);

        const response = await fetch("/api/v1/vectorstore/documents/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(
            data.error ?? `Upload failed with status ${response.status}`,
          );
        }

        const result = await response.json().catch(() => ({}));

        // Optimistically add the document to the list immediately
        if (result.docId) {
          const uploadedDoc: DocumentInfo = {
            docId: result.docId,
            storeId: result.storeId ?? selectedStoreId,
            sourceUri: result.sourceUri ?? file.name,
            version: result.version ?? "",
            status: result.status ?? "pending",
            uploadedAt: result.uploadedAt ?? Date.now(),
          };

          setDocuments((prev) => [uploadedDoc, ...prev]);
          setPendingMetadataDoc(uploadedDoc);
          setPendingAuthor("");
          setPendingDescription("");
          setPendingTags("");
        }

        // Refresh to get accurate data
        await loadDocuments(selectedStoreId);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        console.error("Upload error:", err);
      } finally {
        setIsUploading(false);
        // Reset file input
        event.target.value = "";
      }
    },
    [selectedStoreId, isUploading, loadDocuments],
  );

  const handleStartProcessing = useCallback(async () => {
    if (!pendingMetadataDoc || isStarting) return;

    const author = pendingAuthor.trim();
    const description = pendingDescription.trim();
    const tags = pendingTags.trim();

    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/documents/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: pendingMetadataDoc.docId,
          author: author.length > 0 ? author : undefined,
          description: description.length > 0 ? description : undefined,
          tags: tags.length > 0 ? tags : undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error ?? `Start processing failed (${response.status})`,
        );
      }

      setPendingMetadataDoc(null);
      setPendingAuthor("");
      setPendingDescription("");
      setPendingTags("");
      await loadDocuments(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsStarting(false);
    }
  }, [
    pendingMetadataDoc,
    isStarting,
    pendingAuthor,
    pendingDescription,
    pendingTags,
    loadDocuments,
    selectedStoreId,
  ]);

  const handleSaveMetadata = useCallback(
    async (options?: { reprocessAfterSave?: boolean }) => {
      if (!editMetadataDoc || isSavingMetadata) return;

      const author = editAuthor.trim();
      const description = editDescription.trim();
      const tags = editTags.trim();

      setIsSavingMetadata(true);
      setError(null);
      try {
        const response = await fetch("/api/v1/vectorstore/documents/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            docId: editMetadataDoc.docId,
            author: author.length > 0 ? author : undefined,
            description: description.length > 0 ? description : undefined,
            tags: tags.length > 0 ? tags : undefined,
          }),
        });

        if (!response.ok) {
          const parsed = await readResponseJsonOrText(response);
          if (parsed.ok && parsed.data && typeof parsed.data === "object") {
            const maybeError = (parsed.data as { error?: unknown }).error;
            throw new Error(
              typeof maybeError === "string" && maybeError.trim()
                ? maybeError
                : "Failed to update metadata.",
            );
          }

          throw new Error(
            parsed.ok ? "Failed to update metadata." : parsed.error,
          );
        }

        setEditMetadataDoc(null);
        setEditAuthor("");
        setEditDescription("");
        setEditTags("");

        await loadDocuments(selectedStoreId);

        if (options?.reprocessAfterSave) {
          setReprocessDoc(editMetadataDoc);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsSavingMetadata(false);
      }
    },
    [
      editMetadataDoc,
      isSavingMetadata,
      editAuthor,
      editDescription,
      editTags,
      loadDocuments,
      selectedStoreId,
    ],
  );

  const handleReprocess = useCallback(async () => {
    if (!reprocessDoc || isReprocessing) return;

    setIsReprocessing(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/documents/reprocess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: reprocessDoc.docId }),
      });

      if (!response.ok) {
        const parsed = await readResponseJsonOrText(response);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const maybeError = (parsed.data as { error?: unknown }).error;
          throw new Error(
            typeof maybeError === "string" && maybeError.trim()
              ? maybeError
              : "Failed to reprocess document.",
          );
        }

        throw new Error(
          parsed.ok ? "Failed to reprocess document." : parsed.error,
        );
      }

      setReprocessDoc(null);
      await loadDocuments(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsReprocessing(false);
    }
  }, [reprocessDoc, isReprocessing, loadDocuments, selectedStoreId]);

  const handleCreateStore = useCallback(async () => {
    const trimmed = newStoreId.trim();
    if (!trimmed) return;

    setError(null);
    try {
      const response = await fetch("/api/v1/vectorstore/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: trimmed }),
      });

      if (!response.ok) {
        const parsed = await readResponseJsonOrText(response);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const maybeError = (parsed.data as { error?: unknown }).error;
          throw new Error(
            typeof maybeError === "string" && maybeError.trim()
              ? maybeError
              : "Failed to create store",
          );
        }

        throw new Error(parsed.ok ? "Failed to create store" : parsed.error);
      }

      setNewStoreId("");
      await loadStores();
      setSelectedStoreId(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    }
  }, [newStoreId, loadStores]);

  const handleCancelProcessing = useCallback(
    async (docId: string) => {
      if (isCancelling === docId) return;

      setIsCancelling(docId);
      setError(null);
      try {
        const response = await fetch("/api/v1/vectorstore/documents/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ docId }),
        });

        if (!response.ok) {
          const parsed = await readResponseJsonOrText(response);
          if (parsed.ok && parsed.data && typeof parsed.data === "object") {
            const maybeError = (parsed.data as { error?: unknown }).error;
            throw new Error(
              typeof maybeError === "string" && maybeError.trim()
                ? maybeError
                : "Failed to cancel processing",
            );
          }

          throw new Error(
            parsed.ok ? "Failed to cancel processing" : parsed.error,
          );
        }

        await loadDocuments(selectedStoreId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsCancelling(null);
      }
    },
    [selectedStoreId, isCancelling, loadDocuments],
  );

  const handleDeleteClick = useCallback((doc: DocumentInfo) => {
    setDocToDelete(doc);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!docToDelete || isDeleting) return;

    setIsDeleting(true);
    setError(null);
    try {
      // Cancel processing if in progress
      if (docToDelete.status === "processing") {
        await handleCancelProcessing(docToDelete.docId);
      }

      const response = await fetch("/api/v1/vectorstore/documents/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docId: docToDelete.docId,
          storeId: selectedStoreId,
        }),
      });

      if (!response.ok) {
        const parsed = await readResponseJsonOrText(response);
        if (parsed.ok && parsed.data && typeof parsed.data === "object") {
          const maybeError = (parsed.data as { error?: unknown }).error;
          throw new Error(
            typeof maybeError === "string" && maybeError.trim()
              ? maybeError
              : "Failed to delete document",
          );
        }

        throw new Error(parsed.ok ? "Failed to delete document" : parsed.error);
      }

      setDeleteDialogOpen(false);
      setDocToDelete(null);
      await loadDocuments(selectedStoreId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsDeleting(false);
    }
  }, [
    docToDelete,
    selectedStoreId,
    isDeleting,
    loadDocuments,
    handleCancelProcessing,
  ]);

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Store Selection */}
        <aside className="w-64 border-r border-border bg-card p-4">
          <div className="mb-4">
            <Label
              htmlFor="store-select"
              className="mb-2 block text-sm font-medium"
            >
              Current Store
            </Label>
            <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
              <SelectTrigger id="store-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((store) => (
                  <SelectItem key={store.storeId} value={store.storeId}>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span>{store.storeId}</span>
                      <span className="text-xs text-muted-foreground">
                        ({store.itemCount})
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator className="my-4" />

          <div className="space-y-2">
            <Label htmlFor="new-store" className="text-sm font-medium">
              Create New Store
            </Label>
            <div className="flex gap-2">
              <Input
                id="new-store"
                value={newStoreId}
                onChange={(e) => setNewStoreId(e.target.value)}
                placeholder="Store ID"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateStore();
                  }
                }}
              />
              <Button
                onClick={handleCreateStore}
                disabled={!newStoreId.trim()}
                size="icon"
                aria-label="Create store"
              >
                <Database className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Panel - Documents */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {error && (
            <div className="border-b border-destructive/50 bg-destructive/10 px-6 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Upload Section */}
          <section className="border-b border-border bg-card px-6 py-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label
                  htmlFor="file-upload"
                  className="mb-2 block text-sm font-medium"
                >
                  Upload Document
                </Label>
                <p className="text-xs text-muted-foreground">
                  Upload markdown files (.md) to be processed and indexed
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="file-upload"
                  type="file"
                  accept=".md,.markdown"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
                <Button
                  onClick={() =>
                    document.getElementById("file-upload")?.click()
                  }
                  disabled={isUploading}
                  aria-label="Upload document"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      Upload Document
                    </>
                  )}
                </Button>
              </div>
            </div>
          </section>

          {/* Documents List */}
          <section className="flex-1 overflow-hidden">
            <SimpleBar className="h-full">
              <div className="p-6">
                {isLoadingDocs ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : documents.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    <FileText className="mx-auto mb-2 h-8 w-8 opacity-50" />
                    <p>No documents yet. Upload a document to get started.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div
                        key={doc.docId}
                        className={`flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors ${
                          selectedDoc?.docId === doc.docId
                            ? "bg-accent border-ring"
                            : doc.status === "completed" && doc.chunkCount
                              ? "hover:bg-accent/50 cursor-pointer"
                              : ""
                        }`}
                        onClick={() => {
                          if (doc.status === "completed" && doc.chunkCount) {
                            setSelectedDoc(doc);
                          }
                        }}
                      >
                        <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">
                            {doc.sourceUri}
                          </div>
                          {(doc.author || doc.description) && (
                            <div className="mt-1 text-xs text-muted-foreground line-clamp-2">
                              {doc.author ? `Author: ${doc.author}` : ""}
                              {doc.author && doc.description ? " · " : ""}
                              {doc.description
                                ? `Description: ${doc.description}`
                                : ""}
                            </div>
                          )}
                          {doc.tags && doc.tags.length > 0 && (
                            <div className="mt-1 text-xs text-muted-foreground line-clamp-1">
                              Tags: {doc.tags.join(", ")}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Version: {doc.version} ·{" "}
                            {doc.chunkCount !== undefined
                              ? `${doc.chunkCount} chunks`
                              : doc.status === "processing"
                                ? `Processing${doc.processingStep ? `: ${doc.processingStep}` : ""}${doc.progress ? ` (${doc.progress.current}/${doc.progress.total})` : ""}`
                                : "Processing..."}
                            {doc.totalTokens !== undefined && (
                              <> · {doc.totalTokens.toLocaleString()} tokens</>
                            )}
                            {doc.totalCost !== undefined && (
                              <> · {formatCost(doc.totalCost)}</>
                            )}
                            {doc.status === "processing" && <> · </>}
                          </div>
                          {doc.status === "error" && doc.error && (
                            <div
                              className="mt-1 text-xs text-destructive line-clamp-2"
                              title={doc.error}
                            >
                              {doc.error}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {doc.status === "processing" && (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleCancelProcessing(doc.docId)
                                }
                                disabled={isCancelling === doc.docId}
                                aria-label={`Cancel processing ${doc.sourceUri}`}
                                className="h-7 text-xs"
                              >
                                {isCancelling === doc.docId ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Stopping...
                                  </>
                                ) : (
                                  "Stop"
                                )}
                              </Button>
                            </>
                          )}
                          {doc.status === "pending" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingMetadataDoc(doc);
                                setPendingAuthor(doc.author ?? "");
                                setPendingDescription(doc.description ?? "");
                                setPendingTags(
                                  Array.isArray(doc.tags)
                                    ? doc.tags.join(", ")
                                    : "",
                                );
                              }}
                              aria-label={`Start processing ${doc.sourceUri}`}
                              className="h-7 text-xs"
                            >
                              Start
                            </Button>
                          )}
                          {doc.status !== "processing" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditMetadataDoc(doc);
                                setEditAuthor(doc.author ?? "");
                                setEditDescription(doc.description ?? "");
                                setEditTags(
                                  Array.isArray(doc.tags)
                                    ? doc.tags.join(", ")
                                    : "",
                                );
                              }}
                              aria-label={`Edit metadata for ${doc.sourceUri}`}
                              className="h-7 text-xs"
                            >
                              Edit
                            </Button>
                          )}
                          {doc.status !== "processing" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReprocessDoc(doc);
                              }}
                              aria-label={`Reprocess ${doc.sourceUri}`}
                              className="h-7 text-xs"
                            >
                              Reprocess
                            </Button>
                          )}

                          <span className="text-xs text-muted-foreground capitalize">
                            {doc.status}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClick(doc);
                            }}
                            disabled={doc.status === "processing"}
                            aria-label={`Delete document ${doc.sourceUri}`}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SimpleBar>
          </section>
        </main>
      </div>

      {/* Chunks Drawer */}
      {selectedDoc && selectedDoc.status === "completed" && (
        <DocumentChunksDrawer
          docId={selectedDoc.docId}
          storeId={selectedDoc.storeId}
          sourceUri={selectedDoc.sourceUri}
          onClose={() => setSelectedDoc(null)}
        />
      )}

      {/* Metadata + Start Dialog */}
      <Dialog
        open={pendingMetadataDoc !== null}
        onOpenChange={(open) => {
          if (open) return;
          setPendingMetadataDoc(null);
          setPendingAuthor("");
          setPendingDescription("");
          setPendingTags("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start processing</DialogTitle>
            <DialogDescription>
              Add optional metadata to improve chunk enrichment and retrieval,
              then start processing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pending-author">Author (optional)</Label>
              <Input
                id="pending-author"
                value={pendingAuthor}
                onChange={(e) => setPendingAuthor(e.target.value)}
                placeholder="e.g. Jane Doe, ACME Blog"
                disabled={isStarting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pending-tags">Tags (optional)</Label>
              <Input
                id="pending-tags"
                value={pendingTags}
                onChange={(e) => setPendingTags(e.target.value)}
                placeholder="comma-separated, e.g. fiction, blog, internal"
                disabled={isStarting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="pending-description">
                Description (optional)
              </Label>
              <Textarea
                id="pending-description"
                value={pendingDescription}
                onChange={(e) => setPendingDescription(e.target.value)}
                placeholder='e.g. "Fiction short story" or "Blog post about product launch"'
                disabled={isStarting}
                className="min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPendingMetadataDoc(null);
                setPendingAuthor("");
                setPendingDescription("");
                setPendingTags("");
              }}
              disabled={isStarting}
            >
              Not now
            </Button>
            <Button
              type="button"
              onClick={handleStartProcessing}
              disabled={isStarting || !pendingMetadataDoc}
            >
              {isStarting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Starting...
                </>
              ) : (
                "Start processing"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Metadata Dialog */}
      <Dialog
        open={editMetadataDoc !== null}
        onOpenChange={(open) => {
          if (open) return;
          setEditMetadataDoc(null);
          setEditAuthor("");
          setEditDescription("");
          setEditTags("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit metadata</DialogTitle>
            <DialogDescription>
              Metadata is stored with the document. Reprocess the document to
              rebuild embeddings using the updated metadata.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-author">Author (optional)</Label>
              <Input
                id="edit-author"
                value={editAuthor}
                onChange={(e) => setEditAuthor(e.target.value)}
                placeholder="e.g. Jane Doe, ACME Blog"
                disabled={isSavingMetadata}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-tags">Tags (optional)</Label>
              <Input
                id="edit-tags"
                value={editTags}
                onChange={(e) => setEditTags(e.target.value)}
                placeholder="comma-separated, e.g. fiction, blog, internal"
                disabled={isSavingMetadata}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-description">Description (optional)</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Short description for retrieval / disambiguation"
                disabled={isSavingMetadata}
                className="min-h-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditMetadataDoc(null);
                setEditAuthor("");
                setEditDescription("");
                setEditTags("");
              }}
              disabled={isSavingMetadata}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSaveMetadata()}
              disabled={isSavingMetadata || !editMetadataDoc}
            >
              {isSavingMetadata ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button
              type="button"
              onClick={() => handleSaveMetadata({ reprocessAfterSave: true })}
              disabled={isSavingMetadata || !editMetadataDoc}
            >
              Save &amp; reprocess
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reprocess Confirmation */}
      <Dialog
        open={reprocessDoc !== null}
        onOpenChange={(open) => {
          if (open) return;
          setReprocessDoc(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocess document</DialogTitle>
            <DialogDescription>
              This deletes all existing chunks for &quot;
              {reprocessDoc?.sourceUri}
              &quot; and rebuilds embeddings from the uploaded document.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setReprocessDoc(null)}
              disabled={isReprocessing}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleReprocess}
              disabled={isReprocessing || !reprocessDoc}
            >
              {isReprocessing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reprocessing...
                </>
              ) : (
                "Reprocess"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &quot;{docToDelete?.sourceUri}
              &quot;? This action cannot be undone and will permanently delete:
            </DialogDescription>
            <ul className="mt-2 list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li>The document file and all versions</li>
              <li>All associated metadata</li>
              <li>All vector store chunks for this document</li>
              <li>All cached embeddings for this document</li>
            </ul>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDocToDelete(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
