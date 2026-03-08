/**
 * Input:
 * - message: object
 * Output:
 * - Promise<any>: runtime response payload
 */
function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

globalThis.sendRuntimeMessage = sendRuntimeMessage;
