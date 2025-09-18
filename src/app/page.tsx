'use client';

import { useState, useEffect, useRef } from 'react';
import { ChatMessage, ProcessedData } from '../../lib/types';

// Backend API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001';

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentFile, setCurrentFile] = useState<ProcessedData | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

        // Save current file to localStorage
        localStorage.setItem('excel-chat-current-file', JSON.stringify(fileData));
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
      handleFileUpload(file);
    }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Get file ID from localStorage as backup
    const fileId = currentFile?.id || JSON.parse(localStorage.getItem('excel-chat-current-file') || '{}').id;
    
    if (!fileId) {
      addMessage({
        type: 'assistant',
        content: '❌ No file found. Please upload an Excel file first.',
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
    localStorage.removeItem('excel-chat-history');
    localStorage.removeItem('excel-chat-current-file');
    console.log('🗑️ Cleared all localStorage data');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-800">Анализ данных</h1>
          <div className="flex gap-2">
            {currentFile && (
              <span className="text-sm text-gray-600 bg-green-100 px-3 py-1 rounded-full">
                📊 {currentFile.originalName}
              </span>
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
            <div className="text-center py-12">cd
              <div className="mb-6">
                <h2 className="text-xl font-semibold text-gray-700 mb-2">
                  Добро пожаловать в анализ данных! 📊
                </h2>
                <p className="text-gray-600">
                  Загрузите файл Excel для начала анализа данных с помощью ИИ
                </p>
              </div>
              
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors cursor-pointer"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="text-center">
                  <div className="text-4xl mb-4">📁</div>
                  <p className="text-lg font-medium text-gray-700 mb-2">
                    Перетащите ваш файл Excel сюда
                  </p>
                  <p className="text-gray-500">или нажмите для выбора</p>
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
            {!currentFile && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors whitespace-nowrap"
                disabled={isLoading}
              >
                📁 Загрузить Excel
              </button>
            )}
            
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={currentFile ? "Задайте вопрос о ваших данных..." : "Сначала загрузите файл Excel"}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
              disabled={!currentFile || isLoading}
            />
            
            <button
              type="submit"
              disabled={!input.trim() || !currentFile || isLoading}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Отправить
            </button>
          </form>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}