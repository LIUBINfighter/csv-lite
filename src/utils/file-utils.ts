import { Notice } from "obsidian";

export class FileUtils {
	/**
	 * Attempts to perform a file operation with retry logic
	 * @param operation The file operation function to execute
	 * @param maxRetries Maximum number of retry attempts
	 * @param delayMs Delay between retries in milliseconds
	 * @returns Promise resolving to the operation result or rejecting with an error
	 */
	static async withRetry<T>(
		operation: () => Promise<T>,
		maxRetries: number = 3,
		delayMs: number = 500
	): Promise<T> {
		let lastError: Error = new Error("Unknown error occurred");

		for (let attempt = 0; attempt <= maxRetries; attempt++) {
			try {
				// Attempt the operation
				return await operation();
			} catch (error) {
				lastError = error as Error;

				// Check if this is a "file busy" error
				const isFileBusyError =
					error instanceof Error &&
					(error.message.includes("EBUSY") ||
						error.message.includes("busy") ||
						error.message.includes("locked"));

				// If it's not a file busy error or we've used all retries, throw the error
				if (!isFileBusyError || attempt === maxRetries) {
					break;
				}

				// Show a notice on first retry
				if (attempt === 0) {
					new Notice(
						`File is busy. Retrying... (${
							attempt + 1
						}/${maxRetries})`
					);
				}

				// Wait before retrying
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			}
		}

		// If we get here, all retries failed
		throw lastError;
	}
}

