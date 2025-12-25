/**
 * Registry to track active document processing jobs and allow cancellation.
 */
class DocumentProcessingRegistry {
  private readonly controllers = new Map<string, AbortController>();

  /**
   * Register a new processing job with cancellation support.
   */
  register(docId: string): AbortController {
    // Cancel any existing processing for this docId
    const existing = this.controllers.get(docId);
    if (existing) {
      existing.abort();
    }

    const controller = new AbortController();
    this.controllers.set(docId, controller);
    return controller;
  }

  /**
   * Get the abort controller for a document (if processing).
   */
  get(docId: string): AbortController | null {
    return this.controllers.get(docId) ?? null;
  }

  /**
   * Cancel processing for a document.
   */
  cancel(docId: string): boolean {
    const controller = this.controllers.get(docId);
    if (controller) {
      controller.abort();
      this.controllers.delete(docId);
      return true;
    }
    return false;
  }

  /**
   * Unregister a completed/cancelled job.
   */
  unregister(docId: string): void {
    this.controllers.delete(docId);
  }

  /**
   * Check if a document is currently being processed.
   */
  isProcessing(docId: string): boolean {
    const controller = this.controllers.get(docId);
    return controller !== undefined && !controller.signal.aborted;
  }
}

export const documentProcessingRegistry = new DocumentProcessingRegistry();
