topics.forEach(topic => {
  const btn = document.createElement('button');
  btn.textContent = topic.topicName;
  btn.className = 'saved-topic-btn';
  btn.style.padding = '5px 8px';
  btn.style.border = '1px solid #00ff99';
  btn.style.borderRadius = '4px';
  btn.style.background = '#111';
  btn.style.color = '#00ff99';
  btn.style.cursor = 'pointer';
  btn.addEventListener('click', () => {
    topicNameInput.value = topic.topicName;
    logMonitor(`📝 Topic "${topic.topicName}" selected`);
  });
  savedTopicsContainer.appendChild(btn);
});

