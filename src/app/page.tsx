'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage, ProcessedData, ComparisonData } from '../../lib/types';

// Backend API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentFile, setCurrentFile] = useState<ProcessedData | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [comparisonFiles, setComparisonFiles] = useState<ProcessedData[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<'single' | 'comparison' | 'comparison-setup'>('single');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const comparisonInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load chat history and current file from localStorage on mount
  useEffect(() => {
    const savedMessages = localStorage.getItem('excel-chat-history');
    if (savedMessages) {
      const parsedMessages = JSON.parse(savedMessages);
      // Convert timestamp strings back to Date objects
      const messagesWithDates = parsedMessages.map((msg: ChatMessage) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));
      setMessages(messagesWithDates);
    }

    // Restore current file from localStorage
    const savedFileData = localStorage.getItem('excel-chat-current-file');
    if (savedFileData) {
      try {
        const fileData = JSON.parse(savedFileData);
        setCurrentFile(fileData);
        console.log('📁 Restored file from localStorage:', fileData.originalName);
      } catch (error) {
        console.error('❌ Error restoring file data:', error);
        localStorage.removeItem('excel-chat-current-file');
      }
    }

    // Restore comparison data from localStorage
    const savedComparisonData = localStorage.getItem('excel-chat-comparison-data');
    if (savedComparisonData) {
      try {
        const comparison = JSON.parse(savedComparisonData);
        setComparisonData(comparison);
        setMode('comparison');
        console.log('🔄 Restored comparison data from localStorage');
      } catch (error) {
        console.error('❌ Error restoring comparison data:', error);
        localStorage.removeItem('excel-chat-comparison-data');
      }
    }

    // Restore comparison files in progress
    const savedComparisonFiles = localStorage.getItem('excel-chat-comparison-files');
    if (savedComparisonFiles) {
      try {
        const files = JSON.parse(savedComparisonFiles);
        setComparisonFiles(files);
        if (files.length > 0 && files.length < 2) {
          setMode('comparison-setup');
        }
        console.log('📁 Restored comparison files in progress:', files.length);
      } catch (error) {
        console.error('❌ Error restoring comparison files:', error);
        localStorage.removeItem('excel-chat-comparison-files');
      }
    }
  }, []);

  // Save chat history to localStorage whenever messages change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('excel-chat-history', JSON.stringify(messages));
    }
  }, [messages]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const generateMessageId = () => Date.now().toString() + Math.random().toString(36).substr(2);

  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: generateMessageId(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  const startComparisonMode = () => {
    setMode('comparison-setup');
    setComparisonFiles([]);
    setCurrentFile(null);
    localStorage.removeItem('excel-chat-current-file');
    localStorage.removeItem('excel-chat-comparison-data');
    localStorage.removeItem('excel-chat-comparison-files');
    
    addMessage({
      type: 'assistant',
      content: '🔄 Режим сравнения файлов активирован!\n\nТеперь загрузите первый файл Excel для сравнения.',
    });
  };

  const handleComparisonFileUpload = async (file: File) => {
    if (comparisonFiles.length >= 2) {
      addMessage({
        type: 'assistant',
        content: '❌ Уже загружено максимальное количество файлов для сравнения (2)',
      });
      return;
    }

    setIsLoading(true);
    
    const fileNumber = comparisonFiles.length + 1;
    addMessage({
      type: 'system',
      content: `Загружаю файл ${fileNumber} для сравнения: ${file.name}...`,
    });

    try {
      const formData = new FormData();
      formData.append('excelFile', file);

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.id) {
        const fileData: ProcessedData = {
          id: result.id,
          originalName: result.originalName,
          summary: result.summary,
          sheets: result.sheets,
          createdAt: new Date(),
        };

        const updatedFiles = [...comparisonFiles, fileData];
        setComparisonFiles(updatedFiles);

        // Save files in progress
        localStorage.setItem('excel-chat-comparison-files', JSON.stringify(updatedFiles));

        if (updatedFiles.length === 1) {
          addMessage({
            type: 'assistant',
            content: `✅ Первый файл загружен!\n\n📊 **${result.originalName}**\n${result.summary}\n\nТеперь загрузите второй файл Excel для сравнения.`,
          });
        } else if (updatedFiles.length === 2) {
          // Both files uploaded, create comparison data
          const comparisonData: ComparisonData = {
            file1: updatedFiles[0],
            file2: updatedFiles[1],
          };

          setComparisonData(comparisonData);
          setMode('comparison');
          setComparisonFiles([]); // Clear temporary files

          // Save comparison data and clear temporary files
          localStorage.setItem('excel-chat-comparison-data', JSON.stringify(comparisonData));
          localStorage.removeItem('excel-chat-comparison-files');

          addMessage({
            type: 'assistant',
            content: `✅ Оба файла загружены для сравнения!\n\n📊 **Файл 1:** ${updatedFiles[0].originalName}\n${updatedFiles[0].summary}\n\n📊 **Файл 2:** ${updatedFiles[1].originalName}\n${updatedFiles[1].summary}\n\nТеперь вы можете задавать вопросы для сравнения файлов. Например:\n- "Сравни эти два файла"\n- "Какие основные различия между файлами?"\n- "В каком файле больше записей?"`,
            comparisonData: comparisonData,
          });
        }
      } else {
        addMessage({
          type: 'assistant',
          content: `❌ Ошибка загрузки файла ${fileNumber}: ${result.error}`,
        });
      }
    } catch (error) {
      addMessage({
        type: 'assistant',
        content: `❌ Не удалось загрузить файл ${fileNumber}: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleComparisonUpload = async (files: File[]) => {
    if (files.length === 2) {
      // Handle simultaneous upload of 2 files
      setMode('comparison-setup');
      setComparisonFiles([]);
      
      for (let i = 0; i < files.length; i++) {
        await handleComparisonFileUpload(files[i]);
      }
    } else {
      addMessage({
        type: 'assistant',
        content: '❌ Для одновременной загрузки нужно выбрать ровно два файла Excel',
      });
    }
  };

  const handleFileUpload = async (file: File) => {
    setIsLoading(true);
    
    // Add system message about file upload
    addMessage({
      type: 'system',
      content: `Uploading file: ${file.name}...`,
    });

    try {
      const formData = new FormData();
      formData.append('excelFile', file); // Backend expects 'excelFile'

      const response = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok && result.id) {
        const fileData: ProcessedData = {
          id: result.id,
          originalName: result.originalName,
          summary: result.summary,
          sheets: result.sheets,
          createdAt: new Date(),
        };

        setCurrentFile(fileData);
        setMode('single');
        setComparisonData(null); // Clear comparison mode

        // Save current file to localStorage
        localStorage.setItem('excel-chat-current-file', JSON.stringify(fileData));
        localStorage.removeItem('excel-chat-comparison-data'); // Clear comparison data
        console.log('💾 Saved file data to localStorage with ID:', result.id);

        addMessage({
          type: 'assistant',
          content: `✅ File uploaded successfully!\n\n**${result.originalName}**\n${result.summary}\n\nYou can now ask questions about your data. Try asking things like:\n- "What are the main trends in this data?"\n- "Show me a summary of all columns"\n- "Are there any outliers?"`,
          fileData,
        });
      } else {
        addMessage({
          type: 'assistant',
          content: `❌ Error uploading file: ${result.error}`,
        });
      }
    } catch (error) {
      addMessage({
        type: 'assistant',
        content: `❌ Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (mode === 'comparison-setup') {
        handleComparisonFileUpload(file);
      } else {
        handleFileUpload(file);
      }
    }
  };

  const handleComparisonSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 1 && mode === 'comparison-setup') {
      handleComparisonFileUpload(files[0]);
    } else if (files.length === 2) {
      handleComparisonUpload(files);
    } else if (files.length > 2) {
      addMessage({
        type: 'assistant',
        content: '❌ Можно выбрать максимум 2 файла для сравнения',
      });
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const files = Array.from(event.dataTransfer.files || []);
    
    if (mode === 'comparison-setup') {
      if (files.length === 1) {
        handleComparisonFileUpload(files[0]);
      } else if (files.length === 2) {
        handleComparisonUpload(files);
      } else if (files.length > 2) {
        addMessage({
          type: 'assistant',
          content: '❌ Можно загрузить максимум 2 файла для сравнения',
        });
      }
    } else {
      if (files.length === 1) {
        handleFileUpload(files[0]);
      } else if (files.length === 2) {
        handleComparisonUpload(files);
      } else if (files.length > 2) {
        addMessage({
          type: 'assistant',
          content: '❌ Можно загрузить максимум 2 файла для сравнения',
        });
      }
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (mode === 'comparison') {
      // Handle comparison mode
      if (!comparisonData) {
        addMessage({
          type: 'assistant',
          content: '❌ Данные для сравнения не найдены. Загрузите два файла Excel для сравнения.',
        });
        return;
      }

      addMessage({
        type: 'user',
        content: input.trim(),
      });

      const userInput = input.trim();
      setInput('');
      setIsLoading(true);

      try {
        const loadingMessage = addMessage({
          type: 'assistant',
          content: '⏳ Сравниваю файлы, это может занять несколько минут...',
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 300000);

        const response = await fetch(`${API_BASE_URL}/compare`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: userInput,
            dataId1: comparisonData.file1.id,
            dataId2: comparisonData.file2.id,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));

        const result = await response.json();

        if (response.ok && result.question) {
          const displayContent = result.interpretation || 
            `📊 Результат сравнения:\n\n${JSON.stringify(result.result, null, 2)}`;
            
          addMessage({
            type: 'assistant',
            content: displayContent,
            analysisResult: {
              generatedCode: result.generatedCode,
              executionResult: result.result,
            },
          });
        } else {
          addMessage({
            type: 'assistant',
            content: `❌ Ошибка сравнения: ${result.error || result.details || 'Неизвестная ошибка'}`,
          });
        }
      } catch (error) {
        let errorMessage = '❌ Ошибка сравнения: ';
        
        if (error instanceof Error) {
          if (error.name === 'AbortError') {
            errorMessage += 'Запрос занял слишком много времени (больше 5 минут). Попробуйте упростить вопрос.';
          } else if (error.message.includes('Failed to fetch')) {
            errorMessage += 'Проблема с соединением. Проверьте подключение к интернету или попробуйте позже.';
          } else {
            errorMessage += error.message;
          }
        } else {
          errorMessage += 'Неизвестная ошибка';
        }
        
        addMessage({
          type: 'assistant',
          content: errorMessage,
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Handle single file mode
    const fileId = currentFile?.id || JSON.parse(localStorage.getItem('excel-chat-current-file') || '{}').id;
    
    if (!fileId) {
      addMessage({
        type: 'assistant',
        content: '❌ Файл не найден. Сначала загрузите файл Excel.',
      });
      return;
    }

    addMessage({
      type: 'user',
      content: input.trim(),
    });

    const userInput = input.trim();
    setInput('');
    setIsLoading(true);

    console.log('📤 Sending query with file ID:', fileId);

    try {
      // Add loading message for long operations
      const loadingMessage = addMessage({
        type: 'assistant',
        content: '⏳ Обрабатываю большой файл данных, это может занять несколько минут...',
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 minute timeout

      const response = await fetch(`${API_BASE_URL}/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: userInput,
          dataId: fileId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Remove loading message
      setMessages(prev => prev.filter(msg => msg.id !== loadingMessage.id));

      const result = await response.json();

      if (response.ok && result.question) {
        // Express backend returns different structure
        const displayContent = result.interpretation || 
          `📊 Анализ данных:\n\n${JSON.stringify(result.result, null, 2)}`;
          
        addMessage({
          type: 'assistant',
          content: displayContent,
          analysisResult: {
            generatedCode: result.generatedCode,
            executionResult: result.result,
          },
        });
      } else {
        addMessage({
          type: 'assistant',
          content: `❌ Error processing query: ${result.error || result.details || 'Unknown error'}`,
        });
      }
    } catch (error) {
      let errorMessage = '❌ Ошибка обработки запроса: ';
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          errorMessage += 'Запрос занял слишком много времени (больше 5 минут). Попробуйте упростить вопрос или разбить данные на части.';
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage += 'Проблема с соединением. Проверьте подключение к интернету или попробуйте позже.';
        } else {
          errorMessage += error.message;
        }
      } else {
        errorMessage += 'Неизвестная ошибка';
      }
      
      addMessage({
        type: 'assistant',
        content: errorMessage,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = () => {
    setMessages([]);
    setCurrentFile(null);
    setComparisonData(null);
    setComparisonFiles([]);
    setMode('single');
    localStorage.removeItem('excel-chat-history');
    localStorage.removeItem('excel-chat-current-file');
    localStorage.removeItem('excel-chat-comparison-data');
    localStorage.removeItem('excel-chat-comparison-files');
    console.log('🗑️ Cleared all localStorage data');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Анализ данных</h1>
          <div className="flex gap-2">
            {mode === 'single' && currentFile && (
              <span className="text-sm text-gray-600 bg-green-100 px-3 py-1 rounded-full">
                📊 {currentFile.originalName}
              </span>
            )}
            {mode === 'comparison' && comparisonData && (
              <div className="flex gap-1">
                <span className="text-sm text-gray-600 bg-blue-100 px-3 py-1 rounded-full">
                  🔄 {comparisonData.file1.originalName}
                </span>
                <span className="text-sm text-gray-600 bg-blue-100 px-3 py-1 rounded-full">
                  vs {comparisonData.file2.originalName}
                </span>
              </div>
            )}
            {mode === 'comparison-setup' && (
              <div className="flex gap-1">
                <span className="text-sm text-gray-600 bg-yellow-100 px-3 py-1 rounded-full">
                  🔄 Настройка сравнения ({comparisonFiles.length}/2)
                </span>
                {comparisonFiles.map((file, index) => (
                  <span key={file.id} className="text-sm text-gray-600 bg-green-100 px-2 py-1 rounded-full">
                    {index + 1}. {file.originalName}
                  </span>
                ))}
              </div>
            )}
            <button
              onClick={clearHistory}
              className="text-sm text-gray-600 hover:text-gray-800 px-3 py-1 rounded-full hover:bg-gray-100"
            >
              Очистить историю
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-700 mb-2">
                  Добро пожаловать в анализ данных! 📊
                </h2>
                <p className="text-gray-600">
                  Загрузите файл Excel или два файла для сравнения
                </p>
              </div>
              
              <div className="flex gap-4 max-w-4xl mx-auto">
                {/* Single file upload */}
                <div
                  className="flex-1 border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-green-400 transition-colors cursor-pointer"
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length === 1) handleFileUpload(files[0]);
                  }}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-3">📄</div>
                    <p className="text-md font-medium text-gray-700 mb-1">
                      Анализ одного файла
                    </p>
                    <p className="text-sm text-gray-500">
                      Перетащите или выберите Excel файл
                    </p>
                  </div>
                </div>

                {/* Comparison upload */}
                <div
                  className="flex-1 border-2 border-dashed border-blue-300 rounded-lg p-6 hover:border-blue-400 transition-colors cursor-pointer"
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files || []);
                    if (files.length === 2) handleComparisonUpload(files);
                  }}
                  onDragOver={handleDragOver}
                  onClick={startComparisonMode}
                >
                  <div className="text-center">
                    <div className="text-3xl mb-3">🔄</div>
                    <p className="text-md font-medium text-gray-700 mb-1">
                      Сравнение файлов
                    </p>
                    <p className="text-sm text-gray-500">
                      Загрузите файлы по одному или 2 сразу
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Comparison setup indicator */}
          {mode === 'comparison-setup' && comparisonFiles.length < 2 && (
            <div className="text-center py-8">
              <div className="max-w-md mx-auto border-2 border-dashed border-blue-300 rounded-lg p-6 bg-blue-50">
                <div className="text-center">
                  <div className="text-4xl mb-3">🔄</div>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    {comparisonFiles.length === 0 
                      ? 'Загрузите первый файл для сравнения' 
                      : 'Загрузите второй файл для сравнения'}
                  </p>
                  <p className="text-sm text-gray-600 mb-3">
                    Перетащите файл сюда или используйте кнопку ниже
                  </p>
                  {comparisonFiles.length === 1 && (
                    <div className="text-sm text-green-600 mb-2">
                      ✅ Первый файл: {comparisonFiles[0].originalName}
                    </div>
                  )}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                    disabled={isLoading}
                  >
                    📁 Выбрать {comparisonFiles.length === 0 ? 'первый' : 'второй'} файл
                  </button>
                </div>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.type === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-3xl px-4 py-3 rounded-lg ${
                  message.type === 'user'
                    ? 'bg-blue-500 text-white'
                    : message.type === 'system'
                    ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                    : 'bg-white text-gray-800 border border-gray-200'
                }`}
              >
                <div className="whitespace-pre-wrap">{message.content}</div>
                {message.analysisResult && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium opacity-70 hover:opacity-100">
                      Просмотр технических деталей
                    </summary>
                    <div className="mt-2 p-3 bg-gray-50 rounded border space-y-2">
                      <div>
                        <strong>Сгенерированный код:</strong>
                        <pre className="mt-1 p-2 bg-gray-800 text-green-400 rounded text-xs overflow-x-auto">
                          {message.analysisResult.generatedCode}
                        </pre>
                      </div>
                      <div>
                        <strong>Сырой результат:</strong>
                        <pre className="mt-1 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
                          {JSON.stringify(message.analysisResult.executionResult, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </details>
                )}
                <div className="text-xs opacity-50 mt-2">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white text-gray-800 border border-gray-200 px-4 py-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  <span className="ml-2 text-sm text-gray-600">Обработка...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 bg-white p-4">
        <div className="max-w-4xl mx-auto">
          <form onSubmit={handleSubmit} className="flex gap-3">
            {!currentFile && !comparisonData && mode !== 'comparison-setup' && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors whitespace-nowrap"
                  disabled={isLoading}
                >
                  📄 Один файл
                </button>
                <button
                  type="button"
                  onClick={startComparisonMode}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
                  disabled={isLoading}
                >
                  🔄 Сравнить файлы
                </button>
              </div>
            )}
            
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                mode === 'comparison' && comparisonData 
                  ? "Задайте вопрос для сравнения файлов..." 
                  : mode === 'comparison-setup'
                    ? `Загрузите ${comparisonFiles.length === 0 ? 'первый' : 'второй'} файл для сравнения...`
                  : currentFile 
                    ? "Задайте вопрос о ваших данных..." 
                    : "Сначала загрузите файл(ы) Excel"
              }
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
              disabled={(!currentFile && !comparisonData && mode !== 'comparison-setup') || isLoading}
            />
            
            {mode === 'comparison-setup' && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
                disabled={isLoading || comparisonFiles.length >= 2}
              >
                📁 {comparisonFiles.length === 0 ? 'Файл 1' : 'Файл 2'}
              </button>
            )}
            
            {mode !== 'comparison-setup' && (
              <button
                type="submit"
                disabled={!input.trim() || (!currentFile && !comparisonData) || isLoading}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Отправить
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />
      <input
        ref={comparisonInputRef}
        type="file"
        accept=".xlsx,.xls"
        multiple
        onChange={handleComparisonSelect}
        className="hidden"
      />
    </div>
  );
}