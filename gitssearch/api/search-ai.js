// api/search-ai.js

export default async function handler(req, res) {
    // Правильные заголовки CORS, чтобы фронтенд мог обращаться к этому API
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Обрабатываем предварительный запрос браузера (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 🔑 БЕРЕМ КЛЮЧ ИЗ НАСТРОЕК VERCEL (Environment Variables)
    // Самого ключа в коде нет, поэтому GitHub не будет его блокировать.
    // Как вставить ключ в Vercel: Settings -> Environment Variables -> Key: GROQ_API_KEY, Value: твой_ключ
    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    
    const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
    const GROQ_MODEL = 'llama-3.3-70b-versatile';

    // Если вдруг забыл добавить ключ в Vercel, сервер сразу об этом скажет
    if (!GROQ_API_KEY) {
        return res.status(500).json({ error: 'API key is missing in server environment.' });
    }

    const { type, repo, desc, lang, query } = req.body;

    let prompt = "";
    let jsonResponse = false;

    if (type === 'description') {
        prompt = `Пользователь искал: "${query}". Найден репозиторий: "${repo}". Исходное описание: "${desc || 'нет'}". Язык: ${lang}. Напиши на русском (2-3 предложения): что это, для чего нужно, и как относится к запросу. Не повторяй название.`;
    } else if (type === 'recommendations') {
        prompt = `Пользователь искал в GitHub: "${query}". Предложи 3 ЛЮБЫХ других релевантных инструмента или библиотек, которые ТОЧНО подходят под запрос. Верни СТРОГО JSON: {"results": [{"name": "Имя", "url": "Ссылка", "description": "Почему подходит"}]}.`;
        jsonResponse = true;
    } else if (type === 'fallback') {
        prompt = `На GitHub нет результатов по запросу: "${query}". Предложи 5 самых точных инструментов или руководств. Верни СТРОГО JSON: {"results": [{"name": "Имя", "url": "Ссылка", "description": "Что это"}]}.`;
        jsonResponse = true;
    }

    try {
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`
            },
            body: JSON.stringify({
                model: GROQ_MODEL,
                messages: [
                    { role: 'system', content: 'Ты — ИИ-помощник. Отвечай только на русском.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 200,
                temperature: 0.5,
                response_format: jsonResponse ? { type: "json_object" } : undefined
            })
        });

        // Если Groq отклонил запрос (например, ключ невалиден или лимит исчерпан)
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error("Groq API Error:", response.status, errorData);
            return res.status(response.status).json({ 
                error: `Groq API Error: ${errorData?.error?.message || 'Unknown error'}` 
            });
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content?.trim();

        if (jsonResponse) {
            try {
                const parsed = JSON.parse(content);
                return res.status(200).json(parsed);
            } catch (e) {
                return res.status(200).json({ results: [] }); // Если ИИ вернул кривой JSON, просто возвращаем пустой массив
            }
        } else {
            return res.status(200).json({ description: content });
        }

    } catch (error) {
        console.error("Server Error:", error);
        return res.status(500).json({ error: error.message });
    }
}