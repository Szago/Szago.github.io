// Fetch files from Google Drive API
async function fetchFilesFromFolder(folderId) {
    const apiKey = 'AIzaSyCxnKvYuxNIqobl6Op-XBC500r8qGIjgeY'; // Replace with your API key
    const apiUrl = `https://www.googleapis.com/drive/v3/files?q='${folderId}'+in+parents&key=${apiKey}`;
  
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch files from Google Drive: ${response.statusText}`);
    }
  
    const data = await response.json();
    return data.files;
  }
  
  // Fetch file content from Google Drive API
  async function fetchFileContent(fileId) {
    const apiKey = 'AIzaSyCxnKvYuxNIqobl6Op-XBC500r8qGIjgeY'; // Replace with your API key
    const apiUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
  
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file content from Google Drive: ${response.statusText}`);
    }
  
    const content = await response.text();
    return content;
  }
  
  // Display files content in the HTML
  async function displayFilesContent() {
    const folderId = '1-6VVb55xUMt1SV5aIKd0tvL9j0Fo1gJB'; // Replace with your folder ID
    const fileList = document.getElementById('file-list');
  
    try {
      const files = await fetchFilesFromFolder(folderId);
      files.forEach(async file => {
        const listItem = document.createElement('li');
        const fileContent = await fetchFileContent(file.id);
        const contentElement = document.createElement('pre'); // Use pre to preserve formatting
        contentElement.textContent = fileContent;
        listItem.appendChild(contentElement);
        fileList.appendChild(listItem);
      });
    } catch (error) {
      console.error('Error fetching files content:', error);
    }
  }
  
  // Call displayFilesContent when the page loads
  window.onload = displayFilesContent;
  