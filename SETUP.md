# 🚀 Локальное тестирование Excel Data Chat

## 🏗️ Архитектура (Раздельная)

- **Frontend (Next.js)**: `http://localhost:3000`
- **Backend (Express.js)**: `http://localhost:5000`

## 1. Настройка Backend

### Установка зависимостей (в корневой папке)
```bash
cd data-analyse-llm
npm install
```

### Настройка API ключа
Создайте `.env` файл в корневой папке:
```bash
ANTHROPIC_API_KEY=sk-ant-api03-ваш-реальный-ключ-тут
PORT=5000
```

## 2. Настройка Frontend

### Установка зависимостей
```bash
cd excel-chat
npm install
```

## 3. Настройка Python окружения

Убедитесь что у вас есть виртуальное окружение с pandas:

```bash
# Из корневой папки data-analyse-llm
python3 -m venv venv
source venv/bin/activate
pip install pandas numpy openpyxl xlrd
```

## 4. Запуск приложения

### Запустите Backend (Терминал 1)
```bash
cd data-analyse-llm
npm run dev
# Должно показать: Server running at http://localhost:5000
```

### Запустите Frontend (Терминал 2)
```bash
cd excel-chat  
npm run dev
# Должно показать: Local: http://localhost:3000
```

Откройте http://localhost:3000

## 5. Тестирование

### Создайте тестовый Excel файл:
```csv
Имя,Возраст,Зарплата,Отдел
Иван,25,50000,ИТ
Мария,30,60000,Маркетинг
Петр,35,70000,ИТ
Анна,28,55000,Финансы
```
Сохраните как test.xlsx

### Тест-кейсы:

1. **Загрузка файла:**
   - Перетащите Excel файл в область загрузки
   - Должно появиться сообщение об успешной загрузке
   - В шапке должно отобразиться имя файла

2. **Простые вопросы:**
   - "Сколько всего записей?"
   - "Какая средняя зарплата?"
   - "Покажи сводку по отделам"

3. **Сложные запросы:**
   - "Кто получает больше всех?"
   - "Есть ли корреляция между возрастом и зарплатой?"
   - "Покажи статистику по каждому отделу"

4. **Тест истории:**
   - Задайте несколько вопросов
   - Обновите страницу - история должна сохраниться
   - Нажмите "Clear History" - все удалится

## 6. Возможные ошибки

### "Failed to start Python process"
```bash
# Проверьте путь к Python
cd excel-chat
ls -la ../venv/bin/python
```

### "ANTHROPIC_API_KEY not found"
- Проверьте .env.local файл
- Перезапустите сервер после изменения .env

### "Module not found"
```bash
# Переустановите зависимости Python
pip install pandas numpy openpyxl xlrd
```

## 7. Отладка

Смотрите логи в терминале где запущен `npm run dev`:
- Ошибки загрузки файлов
- Ошибки выполнения Python кода
- API запросы

В браузере (F12 Console):
- JavaScript ошибки
- Сетевые запросы
- Состояние localStorage