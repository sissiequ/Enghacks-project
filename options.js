/**
 * 设置页面逻辑 (options.js)
 * 负责：处理 UI 交互，保存 API Key，以及使用 PDF.js 解析并保存简历文本
 */

// 初始化 PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM 元素获取
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiBtn = document.getElementById('saveApiBtn');
  const apiStatus = document.getElementById('apiStatus');

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const resumeTextPreview = document.getElementById('resumeTextPreview');
  const pdfStatus = document.getElementById('pdfStatus');
  
  const exportJobsBtn = document.getElementById('exportJobsBtn');
  const exportStatus = document.getElementById('exportStatus');

  // 1. 加载现有数据 (使用 apiKey 键名与 background.js 对应)
  chrome.storage.local.get(['apiKey', 'resumeText'], function(result) {
    if (result.apiKey && apiKeyInput) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.resumeText && resumeTextPreview) {
      updateResumePreview(result.resumeText);
    }
  });

  // 2. 保存 API Key
  if (saveApiBtn) {
    saveApiBtn.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      if (!apiKey) {
        alert("请输入有效的 API Key。");
        return;
      }
      // 关键：这里必须保存为 'apiKey' 以供后台脚本读取
      chrome.storage.local.set({ apiKey: apiKey }, function() {
        if (apiStatus) {
          apiStatus.textContent = '设置已成功保存！';
          apiStatus.style.display = 'block';
          apiStatus.style.color = '#389e0d';
          setTimeout(() => {
            apiStatus.style.display = 'none';
          }, 3000);
        }
      });
    });
  }

  // 3. 简历上传处理 (点击区域)
  if (dropZone && fileInput) {
    dropZone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) handlePdfFile(file);
    });

    // 拖拽逻辑
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file && file.type === 'application/pdf') {
        handlePdfFile(file);
      } else {
        alert("请上传有效的 PDF 文件。");
      }
    });
  }
  
  // 4. PDF 解析核心函数
  function handlePdfFile(file) {
    if (resumeTextPreview) {
      resumeTextPreview.textContent = "正在解析 PDF，请稍候...";
    }
    
    const fileReader = new FileReader();
    fileReader.onload = function() {
      const typedarray = new Uint8Array(this.result);

      if (typeof pdfjsLib === 'undefined') {
        if (resumeTextPreview) resumeTextPreview.textContent = "错误: PDF.js 库未加载。";
        return;
      }

      pdfjsLib.getDocument(typedarray).promise.then(pdf => {
        let numPages = pdf.numPages;
        let textPromises = [];

        for (let i = 1; i <= numPages; i++) {
          textPromises.push(
            pdf.getPage(i).then(page => {
              return page.getTextContent().then(textContent => {
                return textContent.items.map(item => item.str).join(' ');
              });
            })
          );
        }

        Promise.all(textPromises).then(pageTexts => {
          const fullText = pageTexts.join('\n\n');
          
          // 保存简历文本到存储
          chrome.storage.local.set({ resumeText: fullText }, function() {
            updateResumePreview(fullText);
            if (pdfStatus) {
              pdfStatus.textContent = '简历已解析并保存成功。';
              pdfStatus.style.display = 'block';
              setTimeout(() => {
                pdfStatus.style.display = 'none';
              }, 3000);
            }
          });
        });
      }).catch(error => {
        console.error("PDF 解析出错:", error);
        if (resumeTextPreview) resumeTextPreview.textContent = "解析失败，请确保文件是标准 PDF 格式。";
      });
    };
    fileReader.readAsArrayBuffer(file);
  }

  // 预览文本辅助函数
  function updateResumePreview(text) {
    if (resumeTextPreview) {
      resumeTextPreview.textContent = text.length > 800 
        ? text.substring(0, 800) + "\n\n... [简历内容过长，仅显示预览]" 
        : text;
    }
  }

  // 导出按钮占位
  if (exportJobsBtn) {
    exportJobsBtn.addEventListener('click', () => {
      if (exportStatus) {
        exportStatus.textContent = "导出功能开发中...";
        exportStatus.style.display = 'block';
        setTimeout(() => exportStatus.style.display = 'none', 2000);
      }
    });
  }
});