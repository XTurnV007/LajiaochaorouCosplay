// 语音功能类
class VoiceManager {
    constructor() {
        this.isRecording = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentAudio = null;
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream);
            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (event) => {
                this.audioChunks.push(event.data);
            };

            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/wav' });
                await this.processRecording(audioBlob);
            };

            this.mediaRecorder.start();
            this.isRecording = true;
            return true;
        } catch (error) {
            console.error('录音失败:', error);
            alert('无法访问麦克风，请检查权限设置');
            return false;
        }
    }

    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            this.mediaRecorder.stop();
            this.isRecording = false;

            // 停止所有音轨
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
        }
    }

    async processRecording(audioBlob) {
        try {
            // 将音频转换为base64或上传到服务器
            const audioUrl = await this.uploadAudio(audioBlob);
            const text = await this.speechToText(audioUrl);

            if (text) {
                // 将识别的文本填入输入框
                const chatInput = document.getElementById('chat-input');
                if (chatInput) {
                    chatInput.value = text;
                }
            }
        } catch (error) {
            console.error('语音处理失败:', error);
        }
    }

    async uploadAudio(audioBlob) {
        // 这里需要实现音频上传到服务器的逻辑
        // 暂时返回一个模拟的URL
        return 'http://example.com/audio.mp3';
    }

    async speechToText(audioUrl) {
        try {
            const response = await fetch(`${AI_CONFIG.BASE_URL}/voice/asr`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
                },
                body: JSON.stringify({
                    model: VOICE_CONFIG.ASR_MODEL,
                    audio: {
                        format: "asr",
                        url: audioUrl
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`ASR请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data.text || data.result?.text;
        } catch (error) {
            console.error('语音识别失败:', error);
            return null;
        }
    }

    async textToSpeech(text) {
        try {
            const response = await fetch(`${AI_CONFIG.BASE_URL}/voice/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
                },
                body: JSON.stringify({
                    audio: {
                        voice_type: VOICE_CONFIG.TTS_VOICE,
                        encoding: "mp3",
                        speed_ratio: 1.0
                    },
                    request: {
                        text: text
                    }
                })
            });

            if (!response.ok) {
                throw new Error(`TTS请求失败: ${response.status}`);
            }

            const data = await response.json();

            if (data.audio_url || data.audio) {
                await this.playAudio(data.audio_url || data.audio);
            }
        } catch (error) {
            console.error('语音合成失败:', error);
        }
    }

    async playAudio(audioUrl) {
        try {
            // 停止当前播放的音频
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }

            this.currentAudio = new Audio(audioUrl);
            await this.currentAudio.play();
        } catch (error) {
            console.error('音频播放失败:', error);
        }
    }

    stopAudio() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio = null;
        }
    }
}

// 游戏状态管理
class GameState {
    constructor() {
        this.currentScreen = 'briefing';
        this.currentSuspect = null;
        this.evidence = [];
        this.conversations = {};
        this.sceneInvestigations = [];
        this.gameCompleted = false;
        this.voiceManager = new VoiceManager();
        this.voiceEnabled = false;
        this.sessionId = this.generateSessionId();
        this.loadGameState();
    }

    generateSessionId() {
        // 每次页面加载都生成新的session ID
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    saveGameState() {
        const gameData = {
            evidence: this.evidence,
            conversations: this.serializeConversations(),
            sceneInvestigations: this.sceneInvestigations,
            gameCompleted: this.gameCompleted,
            sessionId: this.sessionId
        };
        localStorage.setItem('mistTheater_gameState', JSON.stringify(gameData));
        localStorage.setItem('mistTheater_sessionId', this.sessionId);
    }

    loadGameState() {
        try {
            const savedData = localStorage.getItem('mistTheater_gameState');
            const savedSessionId = localStorage.getItem('mistTheater_sessionId');

            // 检查是否是同一个session
            if (savedData && savedSessionId === this.sessionId) {
                const gameData = JSON.parse(savedData);

                // 同一session，恢复所有数据
                this.evidence = gameData.evidence || [];
                this.sceneInvestigations = gameData.sceneInvestigations || [];
                this.gameCompleted = gameData.gameCompleted || false;

                // 恢复对话记录
                if (gameData.conversations) {
                    this.deserializeConversations(gameData.conversations);
                }
            } else {
                // 新session，只恢复对话记录，重置证物袋和现场调查
                if (savedData) {
                    const gameData = JSON.parse(savedData);

                    // 只恢复对话记录
                    if (gameData.conversations) {
                        this.deserializeConversations(gameData.conversations);
                    }
                }

                // 证物袋和现场调查保持初始状态（空数组）
                this.evidence = [];
                this.sceneInvestigations = [];
                this.gameCompleted = false;

                // 保存新的session状态
                this.saveGameState();
            }
        } catch (error) {
            console.error('加载游戏状态失败:', error);
        }
    }

    serializeConversations() {
        const serialized = {};
        for (const [suspectId, conversation] of Object.entries(this.conversations)) {
            serialized[suspectId] = {
                conversationHistory: conversation.conversationHistory,
                hasGivenInitialStatement: conversation.hasGivenInitialStatement,
                stressLevel: conversation.stressLevel
            };
        }
        return serialized;
    }

    deserializeConversations(conversationsData) {
        for (const [suspectId, data] of Object.entries(conversationsData)) {
            const conversation = new AIConversation(suspectId);
            conversation.conversationHistory = data.conversationHistory || [];
            conversation.hasGivenInitialStatement = data.hasGivenInitialStatement || false;
            conversation.stressLevel = data.stressLevel || 0;
            this.conversations[suspectId] = conversation;
        }
    }

    clearGameState() {
        localStorage.removeItem('mistTheater_gameState');
    }

    addEvidence(evidence) {
        if (!this.evidence.find(e => e.id === evidence.id)) {
            this.evidence.push(evidence);
            this.updateEvidenceDisplay();
            this.saveGameState();
        }
    }

    updateEvidenceDisplay() {
        const evidenceList = document.getElementById('evidence-list');
        const availableEvidence = document.getElementById('available-evidence');

        if (this.evidence.length === 0) {
            evidenceList.innerHTML = '<p class="no-evidence">暂无发现的证物</p>';
        } else {
            evidenceList.innerHTML = this.evidence.map(e =>
                `<div class="evidence-item" data-evidence="${e.id}">
                    <h4>${e.name}</h4>
                    <p>${e.description}</p>
                </div>`
            ).join('');
        }

        // 更新审问界面的可用证据
        if (availableEvidence) {
            const evidenceButtons = this.evidence.map(e =>
                `<button class="evidence-btn" data-evidence="${e.id}">${e.name}</button>`
            ).join('');
            availableEvidence.innerHTML = '<span>可出示证据：</span>' + evidenceButtons;
        }
    }
}

// AI角色数据
const suspects = {
    onitake: {
        name: "大盗\"鬼武\"",
        avatar: "🗡️",
        personality: "粗暴、自负、好面子",
        initialStatement: "哈哈哈，没错，那家伙就是老子杀的！我看上了他老婆的美貌，设计把他们骗到了竹林里。我把他绑在树上，当着他的面强暴了他老婆。那女人很刚烈，哭着喊着要我们决斗，说只能活一个。我解开了那家伙的绳子，跟他正面决斗了二十三回合！最后，我一刀刺穿了他的胸膛。他临死前的眼神？哼，那是敬佩，是败给强者的眼神。那女人趁乱跑了。至于那把值钱的匕首，当然被我拿走了，那是我的战利品！",
        secrets: {
            truth: "决斗确实发生了，但过程极其笨拙和可笑。武士吓得腿软，鬼武自己也喝多了酒，根本没有所谓的'二十三回合'。在混乱的推搡中，武士的刀断了，他跪地求饶。鬼武在羞辱他时，失手用匕首将他刺死。",
            motive: "他必须维护自己'强大无匹'的大盗形象。承认自己只是杀死了一个懦夫，并且过程如此狼狈，是比死还难受的耻辱。"
        }
    },
    hana: {
        name: "花子夫人",
        avatar: "🌸",
        personality: "表面柔弱、内心冷酷、善于伪装",
        initialStatement: "那个坏人...他把我丈夫绑起来...然后...然后对我做了那种事...我受尽了屈辱。之后，那个坏人大笑着走了。我挣扎着爬到我丈夫身边，用他身上的小刀给他割断了绳子。但是我看到他看我的眼神...那不是同情，是嫌弃，是冰冷的嫌弃！我一个被玷污的女人，怎么能承受这样的眼神？我昏过去了，等我醒来的时候，只看到我丈夫胸前插着那把小刀，已经...已经自杀了。都是我害了他...都是我...",
        secrets: {
            truth: "她早已厌倦了软弱无能的丈夫。被鬼武侵犯后，她发现这是一个摆脱丈夫的机会。她并没有哭喊，反而用语言刺激和挑拨两人，嘲笑丈夫的懦弱，赞美强盗的勇猛，一手促成了这场决斗。",
            motive: "她要将自己塑造成一个无辜、贞洁、可怜的受害者，并将丈夫的死归结于他自己的'羞愧自尽'，从而洗清自己所有的责任。"
        }
    },
    spirit: {
        name: "金泽武弘之魂",
        avatar: "👻",
        personality: "庄严、虚伪、死要面子",
        initialStatement: "我是金泽武弘...在我妻子被那个强盗侮辱之后，那强盗解开了我的绳子。但是我无法洗刷这个耻辱。我的妻子，她用最决绝的眼神看着我，把那把家传的蓝色丝绸柄匕首递给我，示意我必须做出了断。我...我接受了我的命运。在强盗和妻子都离开后，我面向西方，用那把匕首切腹自尽，保住了最后的尊严。我的灵魂因此得到了安息。",
        secrets: {
            truth: "他根本没有切腹自尽。在决斗中，他表现得极其懦弱，刀断后立刻跪地求饶。他是被鬼武在混乱中失手杀死的。",
            motive: "作为一个武士，承认自己是'跪着被杀'的，是对其身份、荣誉乃至整个家族的终极侮辱。他的鬼魂为了维护自己生前的'武士道'尊严，编造了最高尚的死法——切腹。"
        }
    },
    woodcutter: {
        name: "樵夫吉二郎",
        avatar: "🪓",
        personality: "胆小、贪婪、狡猾",
        initialStatement: "大人，我真的是冤枉的！我就是个打柴的。今天早上，我进竹林想找个好地方砍柴，结果走着走着，就看到...就看到那具尸体躺在那里！旁边只有一把断了的刀，别的什么都没有。吓得我要死，赶紧跑去报官了。我什么都没看见，什么都没拿！",
        secrets: {
            truth: "他是唯一的全程目击者。他躲在暗处看完了整场闹剧。等所有人都走后，他起了贪念，偷走了那把价值不菲、有着蓝色丝绸柄的匕首。",
            motive: "掩盖自己的偷窃罪行。他必须假装自己是'事后'才到现场的，否则无法解释匕首的去向。"
        }
    }
};

// 现场线索数据
const sceneClues = {
    "检查尸体": {
        result: "死者金泽武弘躺在竹林中，胸前有一个致命的刀伤。伤口很深，但形状不规则，不像是正面决斗造成的。他的脸上还残留着恐惧的表情。",
        evidence: null
    },
    "调查树木": {
        result: "你在一棵粗壮的竹子上发现了绳索的痕迹，树皮有被磨损的迹象。看起来确实有人被绑在这里。",
        evidence: {
            id: "rope_marks",
            name: "绳索痕迹",
            description: "竹子上的绳索磨损痕迹，证明确实发生过捆绑"
        }
    },
    "搜索地面": {
        result: "你在地面上发现了一截廉价的草绳，还有一个精致的银簪掉落在泥地里。",
        evidence: {
            id: "rope_and_hairpin",
            name: "草绳和银簪",
            description: "一截普通的草绳和一个精致的银簪，银簪应该属于花子夫人"
        }
    },
    "检查武器": {
        result: "你发现了一把从中间断裂的太刀，刀身质量似乎不佳。奇怪的是，武士腰间的匕首鞘是空的。",
        evidence: {
            id: "broken_sword",
            name: "断裂的太刀",
            description: "武士的太刀从中间断裂，说明战斗激烈但兵器质量不佳"
        }
    },
    "调查周围": {
        result: "周围的茶花丛被踩得一塌糊涂，范围很大。这不像一场有礼有节的决斗，更像一场混乱的扭打。你还发现了一个倾倒的酒壶。",
        evidence: {
            id: "trampled_area",
            name: "凌乱的现场",
            description: "大范围的茶花丛被踩踏，还有一个倾倒的酒壶，说明战斗混乱且有人喝了酒"
        }
    },
    "寻找匕首": {
        result: "你仔细搜索了整个现场，但没有找到那把应该在武士腰间的匕首。这把匕首似乎消失了。",
        evidence: {
            id: "missing_dagger",
            name: "消失的匕首",
            description: "武士腰间的匕首鞘是空的，凶器不见了踪影"
        }
    }
};

// 游戏实例
const game = new GameState();

// AI配置
const AI_CONFIG = {
    API_KEY: 'sk-22e0707355670bac8bd81f77887f87d46a75e90192fbff17d6862e3f2cc542fd', // 请替换为你的API密钥
    BASE_URL: 'https://openai.qiniu.com/v1',
    MODEL: 'gpt-oss-120b'
};

// 语音配置
const VOICE_CONFIG = {
    TTS_VOICE: 'zh_male_M392_conversation_wvae_bigtts',
    ASR_MODEL: 'asr'
};

// AI对话系统
class AIConversation {
    constructor(suspectId) {
        this.suspectId = suspectId;
        this.suspect = suspects[suspectId];
        this.conversationHistory = [];
        this.hasGivenInitialStatement = false;
        this.stressLevel = 0; // 压力等级，影响回答
    }

    getInitialStatement() {
        if (!this.hasGivenInitialStatement) {
            this.hasGivenInitialStatement = true;
            const statement = this.suspect.initialStatement;

            // 记录初始证词到对话历史
            this.conversationHistory.push({
                player: "[开始审问]",
                npc: statement,
                evidence: null,
                isInitial: true
            });

            // 保存游戏状态
            game.saveGameState();

            return statement;
        }
        return null;
    }

    async generateResponse(playerMessage, presentedEvidence = null) {
        let response = "";

        // 使用真实AI生成回应
        response = await this.callAIAPI(playerMessage, presentedEvidence);

        this.conversationHistory.push({
            player: playerMessage,
            npc: response,
            evidence: presentedEvidence,
            isInitial: false
        });

        // 保存游戏状态
        game.saveGameState();

        return response;
    }

    async callAIAPI(playerMessage, presentedEvidence = null) {
        try {
            const systemPrompt = this.buildSystemPrompt(presentedEvidence);
            const messages = this.buildMessageHistory(playerMessage, systemPrompt);

            const response = await fetch(`${AI_CONFIG.BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AI_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    stream: false,
                    model: AI_CONFIG.MODEL,
                    messages: messages,
                    temperature: 0.8,
                    max_tokens: 500
                })
            });

            if (!response.ok) {
                throw new Error(`API请求失败: ${response.status}`);
            }

            const data = await response.json();
            return data.choices[0].message.content;
        } catch (error) {
            console.error('AI API调用失败:', error);
            // 降级到本地逻辑
            return this.generateContextualResponse(playerMessage, presentedEvidence);
        }
    }

    buildSystemPrompt(presentedEvidence) {
        const suspect = this.suspect;
        const suspectId = this.suspectId;

        let prompt = `你正在扮演《竹林之下》案件中的角色：${suspect.name}。

## 角色核心设定
- 性格：${suspect.personality}
- 公开证词：${suspect.initialStatement}
- 真实秘密：${suspect.secrets.truth}
- 撒谎动机：${suspect.secrets.motive}

## 当前状态
- 压力等级：${this.stressLevel}/5
- 情绪状态：${this.getEmotionState()}

## 角色扮演核心规则
1. **严格保持角色一致性**：始终按照角色的性格、动机和背景回答
2. **情绪表达**：在回答前用括号表达情绪和动作，如"（紧张地擦汗）"、"（愤怒地握拳）"
3. **压力反应**：根据压力等级调整回答方式：
   - 0-1级：平静、自信
   - 2-3级：开始紧张、防御性增强
   - 4-5级：慌乱、可能露出破绽
4. **谎言坚持**：除非压力极高(4+)，否则坚持你的谎言版本
5. **语言风格**：使用现代白话文，通俗易懂，符合现代人的说话习惯，不超过100字
6. **禁止使用**：不要使用文言文、古代汉语或日语，要说现代中文白话

`;

        // 根据不同角色添加特定的行为指导
        if (suspectId === 'onitake') {
            prompt += `## 鬼武特定行为指导
- 性格表现：粗暴、自负、好面子，绝不承认自己懦弱
- 语言特点：说话粗鲁直接，经常吹牛，喜欢说"老子"、"那家伙"，用现代粗话
- 敏感话题：任何质疑你武力或勇气的话题都会让你愤怒
- 关键证物反应：
  * 断剑/凌乱现场/消失匕首：会紧张但强装镇定
  * 其他证物：表现得不在乎或不知情
- 情绪变化：从自负→紧张→愤怒→慌乱
- 说话示例："哼，老子就是杀了他！"、"那家伙太弱了！"

`;
        } else if (suspectId === 'hana') {
            prompt += `## 花子夫人特定行为指导
- 性格表现：表面柔弱可怜，内心冷酷计算
- 语言特点：说话柔弱，经常哭泣，称呼丈夫为"我丈夫"或"他"，用现代女性的说话方式
- 敏感话题：任何暗示你不是受害者的话题都会让你慌乱
- 关键证物反应：
  * 银簪：极度慌乱，这是你最大的破绽
  * 消失匕首：紧张但试图掩饰
  * 其他证物：表现得像无辜受害者
- 情绪变化：从悲伤→紧张→慌乱→几近崩溃
- 说话示例："我真的很害怕..."、"我什么都不知道..."、"那个坏人..."

`;
        } else if (suspectId === 'spirit') {
            prompt += `## 武士之魂特定行为指导
- 性格表现：死要面子，维护武士尊严，庄严但虚伪
- 语言特点：说话比较正式严肃，但用现代汉语，经常提到"尊严"、"荣誉"，自称"我"
- 敏感话题：任何质疑你武士身份或暗示你懦弱的话题
- 关键证物反应：
  * 断剑：极度愤怒，这戳中了你的痛处
  * 消失匕首：试图维护切腹谎言
  * 其他证物：表现得超然，说已死不在乎
- 情绪变化：从庄严→防御→愤怒→屈辱
- 说话示例："我是有尊严地死去的"、"我绝不会做那种事"、"作为武士..."

`;
        } else if (suspectId === 'woodcutter') {
            prompt += `## 樵夫特定行为指导
- 性格表现：胆小、贪婪、狡猾，但装作老实
- 语言特点：说话结巴、谦卑，经常说"我就是个打柴的"、"我啥都不知道"，用朴实的现代口语
- 敏感话题：任何关于匕首或偷窃的话题都会让你极度紧张
- 关键证物反应：
  * 消失匕首：极度恐慌，几乎崩溃，这是你的致命弱点
  * 其他证物：表现得胆怯但诚实
- 情绪变化：从胆怯→紧张→恐慌→几近崩溃
- 说话示例："我...我真不知道"、"我就是个普通人"、"我发誓没撒谎"

`;
        }

        // 如果出示了证据，添加证据反应指导
        if (presentedEvidence) {
            const evidenceId = presentedEvidence.id;
            prompt += `\n## 证据反应指导
玩家刚刚出示了证据：${presentedEvidence.name} - ${presentedEvidence.description}

`;

            // 根据角色和证据类型给出具体的反应指导
            const reactionGuidance = this.getEvidenceReactionGuidance(evidenceId, suspectId);
            prompt += reactionGuidance;
        }

        return prompt;
    }

    getEmotionState() {
        if (this.stressLevel <= 1) return '平静';
        else if (this.stressLevel <= 2) return '紧张';
        else if (this.stressLevel <= 3) return '焦虑';
        else if (this.stressLevel <= 4) return '恐慌';
        else return '崩溃边缘';
    }

    getEvidenceReactionGuidance(evidenceId, suspectId) {
        const reactions = {
            'onitake': {
                'broken_sword': '这个证据让你紧张！你需要为自己的"实力"辩护，但要显得有些心虚。压力+2。',
                'trampled_area': '这个证据让你慌张！你需要解释战斗的激烈，但要露出破绽。压力+2。',
                'missing_dagger': '这个证据让你极度紧张！你声称拿走了匕首，但要表现得心虚。压力+3。',
                'rope_marks': '这个证据对你有利！你可以得意地说这证明了你的说法。',
                'default': '你对这个证据不太在意，表现得漠不关心，说专心对付武士没注意别的。'
            },
            'hana': {
                'rope_and_hairpin': '这个证据让你极度慌乱！银簪是你最大的破绽，你需要拼命解释。压力+4。',
                'missing_dagger': '这个证据让你紧张！你知道真相但要撒谎，眼神要闪烁。压力+2。',
                'default': '你表现得像无辜的受害者，说太害怕了什么都记不清楚。'
            },
            'spirit': {
                'broken_sword': '这个证据让你极度愤怒！这戳中了你的痛处，你要愤怒地为自己辩护。压力+4。',
                'missing_dagger': '这个证据让你有些紧张！你要维护切腹的谎言。压力+1。',
                'default': '你表现得超然，说已经死了不在乎这些尘世的物证。'
            },
            'woodcutter': {
                'missing_dagger': '这个证据让你极度恐慌！这是你的致命弱点，你要拼命否认。压力+5。',
                'default': '你表现得胆怯但诚实，说自己只是砍柴的什么都不懂。'
            }
        };

        const suspectReactions = reactions[suspectId] || {};
        return suspectReactions[evidenceId] || suspectReactions['default'] || '你对这个证据感到困惑，不知道该如何回应。';
    }

    buildMessageHistory(playerMessage, systemPrompt) {
        const messages = [
            { role: 'system', content: systemPrompt }
        ];

        // 添加最近的对话历史（最多5轮）
        const recentHistory = this.conversationHistory.slice(-5);
        for (const turn of recentHistory) {
            messages.push({ role: 'user', content: turn.player });
            messages.push({ role: 'assistant', content: turn.npc });
        }

        // 添加当前问题
        messages.push({ role: 'user', content: playerMessage });

        return messages;
    }

    generateContextualResponse(message, evidence) {
        // 如果出示了证据，处理压力等级变化
        if (evidence) {
            const aiResponse = this.handleEvidencePresentation(evidence, message);
            if (aiResponse) {
                return aiResponse; // 如果有预设回应就返回
            }
            // 否则让AI根据增强的提示词生成回应
        }

        // 为没有API的情况提供基本的降级回应
        const suspectId = this.suspectId;
        const responses = {
            'onitake': [
                "（粗暴地）我已经告诉你真相了！还有什么好问的？",
                "（不耐烦）那武士就是我杀的，这有什么好怀疑的？",
                "（自负地）我鬼武从不说谎！"
            ],
            'hana': [
                "（哭泣）我...我已经说了我知道的一切...",
                "（颤抖）请不要再逼我回忆那些可怕的事情...",
                "（悲伤）我只是个可怜的女人..."
            ],
            'spirit': [
                "（庄严地）我已经告诉了你事情的真相...",
                "（平静地）我已经死了，这些对我来说已经不重要了...",
                "（威严地）武士的话就是真理。"
            ],
            'woodcutter': [
                "（胆怯地）我...我真的什么都不知道...",
                "（结巴）我只是个砍柴的，什么都不懂...",
                "（紧张地）我发誓我说的都是真的！"
            ]
        };

        const suspectResponses = responses[suspectId] || ["我不知道该说什么..."];
        return suspectResponses[Math.floor(Math.random() * suspectResponses.length)];
    }

    generateOnitakeResponse(message) {
        if (message.includes('决斗') || message.includes('战斗')) {
            return "哈！那是一场真正的武士决斗！我们打了整整二十三回合，刀光剑影，那场面壮观得很！最后我一刀刺穿了他的心脏，干净利落！";
        } else if (message.includes('匕首') || message.includes('刀')) {
            return "那把匕首？当然是我的战利品！打败了武士，他的武器自然归我所有。那可是把好刀，蓝色丝绸的刀柄，值不少钱呢！";
        } else if (message.includes('花子') || message.includes('女人') || message.includes('妻子')) {
            return "那女人？哼，她看到我的勇猛后就被征服了。她亲眼看着我击败她那懦弱的丈夫，眼中满是敬畏！";
        } else if (message.includes('害怕') || message.includes('恐惧') || message.includes('懦弱')) {
            this.stressLevel += 1;
            return "害怕？我鬼武什么时候害怕过！那武士才是懦夫，不过他最后还是像个男人一样战斗了！";
        } else if (message.includes('酒') || message.includes('喝酒')) {
            this.stressLevel += 1;
            return "酒？我...我只是喝了一点壮胆，真正的战士需要酒精来激发斗志！这不影响我的实力！";
        }

        return "我已经告诉你真相了！我堂堂正正地杀了那个武士，这有什么好质疑的？";
    }

    generateHanaResponse(message) {
        if (message.includes('决斗') || message.includes('战斗')) {
            return "（哭泣）我...我当时太害怕了，只记得那个恶鬼解开了夫君的绳子，然后他们就...就打起来了。我不敢看，只能闭着眼睛祈祷...";
        } else if (message.includes('匕首') || message.includes('刀')) {
            return "（颤抖）那把刀...是夫君的家传之物。我看到他用那把刀...用那把刀结束了自己的生命。我永远忘不了那个画面...";
        } else if (message.includes('自杀') || message.includes('自尽')) {
            return "（痛哭）是的...夫君他...他无法承受这样的耻辱。他看我的眼神那么冷漠，那么嫌弃...然后就...";
        } else if (message.includes('银簪') || message.includes('簪子')) {
            this.stressLevel += 1;
            return "银簪？我...我当时太慌乱了，可能是在逃跑的时候掉了。那时候我只想离开那个可怕的地方...";
        } else if (message.includes('挑拨') || message.includes('刺激')) {
            this.stressLevel += 2;
            return "（愤怒）你在说什么？我怎么可能挑拨他们？我是受害者！我只是一个可怜的女人！";
        } else if (message.includes('厌倦') || message.includes('不爱')) {
            this.stressLevel += 2;
            return "（激动）胡说！我深爱着我的夫君！虽然他...虽然他有时候确实...但我从未想过要害他！";
        }

        return "（抽泣）我已经失去了一切...请不要再逼我回忆那些痛苦的事情了...";
    }

    generateSpiritResponse(message) {
        if (message.includes('决斗') || message.includes('战斗')) {
            return "（庄严地）那不是战斗，那是我作为武士最后的尊严。我无法让那强盗继续羞辱我和我的妻子...";
        } else if (message.includes('切腹') || message.includes('自尽')) {
            return "（平静地）是的，我选择了切腹。这是武士面对无法洗刷的耻辱时唯一的选择。我面向西方，用家传的匕首结束了自己的生命。";
        } else if (message.includes('懦弱') || message.includes('害怕') || message.includes('跪')) {
            this.stressLevel += 2;
            return "（愤怒）住口！我是武士！我绝不会做出有损武士尊严的事情！我是光荣地死去的！";
        } else if (message.includes('匕首') || message.includes('刀')) {
            return "那把匕首是我家族的传家宝，蓝色丝绸的刀柄是我祖父亲手缠绕的。我用它完成了最后的仪式...";
        } else if (message.includes('妻子') || message.includes('花子')) {
            return "我的妻子...她受了那么大的屈辱，而我却无法保护她。这是我最大的失败...";
        }

        return "（叹息）我已经死了，这些尘世的纠葛对我来说已经不重要了...";
    }

    generateWoodcutterResponse(message) {
        if (message.includes('看到') || message.includes('目击') || message.includes('现场')) {
            this.stressLevel += 1;
            return "我什么都没看到！我发现尸体的时候，现场就只有一具尸体和一把断刀！我吓得要死，立刻就去报官了！";
        } else if (message.includes('匕首') || message.includes('刀')) {
            this.stressLevel += 2;
            return "（紧张）匕首？什么匕首？我没看到什么匕首！现场只有那把断了的太刀！";
        } else if (message.includes('偷') || message.includes('拿走') || message.includes('贪心')) {
            this.stressLevel += 3;
            return "（慌张）我没偷任何东西！我是个老实人！我只是砍柴的，怎么会偷死人的东西？";
        } else if (message.includes('躲') || message.includes('藏')) {
            this.stressLevel += 2;
            return "（结巴）我...我没有躲起来！我是正大光明地进竹林砍柴的！谁会躲起来看那种可怕的事情？";
        } else if (message.includes('全程') || message.includes('整个过程')) {
            this.stressLevel += 3;
            return "（极度紧张）我不知道你在说什么！我什么都没看到！我发誓！我只是个可怜的樵夫！";
        }

        if (this.stressLevel > 3) {
            return "（崩溃）好吧好吧！我承认我看到了一些...但我真的什么都没拿！我发誓！";
        }

        return "大人，我真的只是个砍柴的。我什么都不知道，只是运气不好发现了尸体...";
    }

    handleEvidencePresentation(evidence, message) {
        // 现在压力等级的增加在提示词中指导，这里只需要根据证据类型调整压力
        const evidenceId = evidence.id;
        const suspectId = this.suspectId;

        // 根据角色和证据类型增加相应的压力等级
        const stressIncrease = this.getStressIncrease(evidenceId, suspectId);
        this.stressLevel += stressIncrease;

        // 让AI根据增强的提示词自然生成回应
        return null; // 返回null表示使用AI生成的回应
    }

    getStressIncrease(evidenceId, suspectId) {
        const stressMap = {
            'onitake': {
                'broken_sword': 2,
                'trampled_area': 2,
                'missing_dagger': 3,
                'rope_marks': 0, // 对他有利
                'default': 0
            },
            'hana': {
                'rope_and_hairpin': 4,
                'missing_dagger': 2,
                'default': 0
            },
            'spirit': {
                'broken_sword': 4,
                'missing_dagger': 1,
                'default': 0
            },
            'woodcutter': {
                'missing_dagger': 5,
                'default': 0
            }
        };

        const suspectStress = stressMap[suspectId] || {};
        return suspectStress[evidenceId] || suspectStress['default'] || 0;
    }
}

// 界面控制
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    game.currentScreen = screenId;
}

function showPanel(panelId) {
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    document.getElementById(panelId).classList.add('active');
    document.getElementById(`nav-${panelId.replace('-panel', '')}`).classList.add('active');

    // 如果切换到现场调查面板，恢复调查记录和状态
    if (panelId === 'scene-panel') {
        restoreSceneInvestigations();
        restoreSceneState();
    }
}

function restoreSceneInvestigations() {
    const resultsContainer = document.getElementById('scene-results');
    resultsContainer.innerHTML = '';

    game.sceneInvestigations.forEach(record => {
        const resultDiv = document.createElement('div');
        resultDiv.className = 'scene-result';

        // 如果是重复调查，添加相应的样式
        if (record.isRepeat) {
            resultDiv.classList.add('repeat');
        }

        let content = `<strong>调查结果：</strong>${record.result}`;
        if (record.evidence) {
            content += `<br><strong>发现证据：</strong>${record.evidence}`;
        }
        content += `<br><small style="color: #7f8c8d;">调查时间: ${record.timestamp}</small>`;

        resultDiv.innerHTML = content;
        resultsContainer.appendChild(resultDiv);
    });

    resultsContainer.scrollTop = resultsContainer.scrollHeight;
}

// 更新嫌疑人情绪状态显示
function updateSuspectStatus(conversation) {
    const stressLevel = conversation.stressLevel;
    const stressPercentage = Math.min((stressLevel / 5) * 100, 100);

    // 更新压力条
    const stressFill = document.getElementById('stress-fill');
    const stressText = document.getElementById('stress-text');
    const emotionIndicator = document.getElementById('emotion-indicator');

    if (stressFill) {
        stressFill.style.width = `${stressPercentage}%`;
    }

    // 根据压力等级显示不同的状态
    let stressLabel, emotion, textColor;
    if (stressLevel <= 1) {
        stressLabel = '平静';
        emotion = '😐 平静';
        textColor = '#27ae60';
    } else if (stressLevel <= 2) {
        stressLabel = '紧张';
        emotion = '😟 紧张';
        textColor = '#f39c12';
    } else if (stressLevel <= 3) {
        stressLabel = '焦虑';
        emotion = '😰 焦虑';
        textColor = '#e67e22';
    } else if (stressLevel <= 4) {
        stressLabel = '恐慌';
        emotion = '😨 恐慌';
        textColor = '#e74c3c';
    } else {
        stressLabel = '崩溃';
        emotion = '😱 崩溃';
        textColor = '#c0392b';
    }

    if (stressText) {
        stressText.textContent = stressLabel;
        stressText.style.color = textColor;
    }

    if (emotionIndicator) {
        emotionIndicator.textContent = emotion;
        emotionIndicator.style.backgroundColor = `${textColor}20`;
        emotionIndicator.style.border = `1px solid ${textColor}`;
    }
}

// 审问功能
function startInterrogation(suspectId) {
    game.currentSuspect = suspectId;
    const suspect = suspects[suspectId];

    document.getElementById('current-suspect-name').textContent = `审问 ${suspect.name}`;
    document.getElementById('chat-messages').innerHTML = '';

    // 初始化对话
    if (!game.conversations[suspectId]) {
        game.conversations[suspectId] = new AIConversation(suspectId);
    }

    const conversation = game.conversations[suspectId];

    game.updateEvidenceDisplay();
    showScreen('interrogation-screen');

    // 更新嫌疑人状态显示
    updateSuspectStatus(conversation);

    // 显示系统消息
    addMessage('system', `你开始审问 ${suspect.name}`);

    // 恢复之前的对话记录
    if (conversation.conversationHistory.length > 0) {
        conversation.conversationHistory.forEach(turn => {
            if (turn.isInitial) {
                addMessage('npc', turn.npc);
            } else {
                if (turn.evidence) {
                    addMessage('system', `你出示了证据：${turn.evidence.name}`);
                }
                addMessage('player', turn.player);
                addMessage('npc', turn.npc);
            }
        });
    } else {
        // 如果是第一次审问，立即显示预设发言
        const initialStatement = conversation.getInitialStatement();
        if (initialStatement) {
            addMessage('npc', initialStatement);
        }
    }
}

function addMessage(type, content) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    input.value = '';
    addMessage('player', message);

    // 显示AI思考中
    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'message npc';
    thinkingMsg.textContent = '思考中...';
    document.getElementById('chat-messages').appendChild(thinkingMsg);

    try {
        const conversation = game.conversations[game.currentSuspect];
        const response = await conversation.generateResponse(message);

        // 移除思考中消息
        thinkingMsg.remove();
        addMessage('npc', response);

        // 更新嫌疑人状态
        updateSuspectStatus(conversation);

        // 如果启用了语音，播放AI回复
        if (game.voiceEnabled && AI_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE') {
            await game.voiceManager.textToSpeech(response);
        }
    } catch (error) {
        thinkingMsg.textContent = '对话出现错误，请重试。';
    }
}

function toggleRecording() {
    const recordBtn = document.getElementById('voice-record');

    if (!game.voiceManager.isRecording) {
        game.voiceManager.startRecording().then(success => {
            if (success) {
                recordBtn.classList.add('recording');
                recordBtn.textContent = '🔴';
                recordBtn.title = '停止录音';
            }
        });
    } else {
        game.voiceManager.stopRecording();
        recordBtn.classList.remove('recording');
        recordBtn.textContent = '🎤';
        recordBtn.title = '语音输入';
    }
}

function updateAPIKey() {
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKey = apiKeyInput.value.trim();

    if (apiKey) {
        AI_CONFIG.API_KEY = apiKey;
        console.log('API密钥已更新');
    }
}

// 出示证据功能
function presentEvidence(evidenceId) {
    const evidence = game.evidence.find(e => e.id === evidenceId);
    if (!evidence) return;

    addMessage('system', `你出示了证据：${evidence.name}`);

    // 显示AI思考中
    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'message npc';
    thinkingMsg.textContent = '思考中...';
    document.getElementById('chat-messages').appendChild(thinkingMsg);

    setTimeout(async () => {
        try {
            const conversation = game.conversations[game.currentSuspect];
            const response = await conversation.generateResponse(`[出示证据: ${evidence.name}]`, evidence);

            thinkingMsg.remove();
            addMessage('npc', response);

            // 更新嫌疑人状态
            updateSuspectStatus(conversation);

            // 如果启用了语音，播放AI回复
            if (game.voiceEnabled && AI_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE') {
                await game.voiceManager.textToSpeech(response);
            }
        } catch (error) {
            thinkingMsg.textContent = '对话出现错误，请重试。';
        }
    }, 500);
}

// 现场调查功能 - 图片交互版本
function investigateHotspot(clueKey) {
    // 查找对应的线索
    const foundClue = sceneClues[clueKey];

    // 检查是否已经调查过这个区域
    const alreadyInvestigated = game.sceneInvestigations.some(record => record.command === clueKey);
    const hotspot = document.querySelector(`[data-clue="${clueKey}"]`);

    const resultsContainer = document.getElementById('scene-results');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'scene-result';

    let investigationRecord = {
        command: clueKey,
        timestamp: new Date().toLocaleTimeString()
    };

    if (foundClue) {
        if (alreadyInvestigated) {
            // 已经调查过，给出不同的反馈
            const repeatMessages = [
                "你再次仔细检查了这个区域，但没有发现新的线索。",
                "这里你已经调查过了，没有遗漏什么。",
                "你重新审视了这个地方，确认之前的发现是正确的。",
                "这个区域你已经彻底搜查过了。"
            ];
            const randomMessage = repeatMessages[Math.floor(Math.random() * repeatMessages.length)];
            resultDiv.innerHTML = `<strong>调查结果：</strong>${randomMessage}`;
            resultDiv.classList.add('repeat');
            investigationRecord.result = randomMessage;
            investigationRecord.isRepeat = true;
        } else {
            // 首次调查
            resultDiv.innerHTML = `<strong>调查结果：</strong>${foundClue.result}`;
            investigationRecord.result = foundClue.result;

            if (foundClue.evidence) {
                game.addEvidence(foundClue.evidence);
                resultDiv.innerHTML += `<br><strong>发现证据：</strong>${foundClue.evidence.name}`;
                investigationRecord.evidence = foundClue.evidence.name;
            }

            // 标记热点为已调查
            if (hotspot) {
                hotspot.classList.add('investigated');
            }
        }
    } else {
        const result = `你调查了这个区域，但没有发现什么特别的线索。`;
        resultDiv.innerHTML = `<strong>调查结果：</strong>${result}`;
        investigationRecord.result = result;
    }

    // 保存调查记录
    game.sceneInvestigations.push(investigationRecord);
    game.saveGameState();

    resultsContainer.appendChild(resultDiv);
    resultsContainer.scrollTop = resultsContainer.scrollHeight;

    // 添加调查动画效果
    resultDiv.style.opacity = '0';
    resultDiv.style.transform = 'translateY(20px)';
    setTimeout(() => {
        resultDiv.style.transition = 'all 0.5s ease';
        resultDiv.style.opacity = '1';
        resultDiv.style.transform = 'translateY(0)';
    }, 100);
}

// 切换热点显示
function toggleHotspots() {
    const hotspots = document.querySelectorAll('.hotspot');
    const isVisible = hotspots[0].classList.contains('visible');

    hotspots.forEach(hotspot => {
        if (isVisible) {
            hotspot.classList.remove('visible');
        } else {
            hotspot.classList.add('visible');
        }
    });

    const button = document.getElementById('toggle-hotspots');
    button.textContent = isVisible ? '显示提示' : '隐藏提示';
}



// 图片交互初始化
function initializeSceneInteraction() {
    // 为所有热点添加点击事件
    document.querySelectorAll('.hotspot').forEach(hotspot => {
        hotspot.addEventListener('click', (e) => {
            e.preventDefault();
            const clueKey = hotspot.dataset.clue;
            investigateHotspot(clueKey);

            // 添加点击动画
            hotspot.style.transform = 'scale(1.2)';
            setTimeout(() => {
                hotspot.style.transform = 'scale(1)';
            }, 200);
        });

        // 鼠标悬停效果
        hotspot.addEventListener('mouseenter', () => {
            if (!hotspot.classList.contains('investigated')) {
                hotspot.classList.add('pulse-animation');
            }
        });

        hotspot.addEventListener('mouseleave', () => {
            hotspot.classList.remove('pulse-animation');
        });
    });

    // 图片加载完成后调整热点位置
    const crimeSceneImage = document.getElementById('crime-scene-image');
    if (crimeSceneImage) {
        crimeSceneImage.addEventListener('load', adjustHotspotPositions);

        // 首次加载时显示热点提示3秒
        setTimeout(() => {
            const hotspots = document.querySelectorAll('.hotspot');
            hotspots.forEach(hotspot => hotspot.classList.add('visible'));

            setTimeout(() => {
                hotspots.forEach(hotspot => hotspot.classList.remove('visible'));
            }, 3000);
        }, 1000);
    }

    // 窗口大小改变时重新调整
    window.addEventListener('resize', adjustHotspotPositions);
}

// 调整热点位置以适应不同屏幕尺寸
function adjustHotspotPositions() {
    // 这个函数可以根据实际图片尺寸动态调整热点位置
    // 目前使用CSS百分比定位，在大多数情况下应该工作良好
}

// 恢复现场调查状态
function restoreSceneState() {
    // 先清除所有热点的调查状态
    document.querySelectorAll('.hotspot').forEach(hotspot => {
        hotspot.classList.remove('investigated');
    });

    // 恢复已调查的热点状态
    game.sceneInvestigations.forEach(record => {
        const hotspot = document.querySelector(`[data-clue="${record.command}"]`);
        if (hotspot) {
            hotspot.classList.add('investigated');
        }
    });
}

// 结案指认功能
function submitAccusation() {
    const killer = document.getElementById('killer-select').value;
    const method = document.getElementById('method-text').value.trim();
    const motive = document.getElementById('motive-text').value.trim();

    if (!killer || !method || !motive) {
        alert('请完整填写所有信息！');
        return;
    }

    // 判断结果
    const isCorrect = evaluateAccusation(killer, method, motive);
    showResult(isCorrect, killer, method, motive);
}

function evaluateAccusation(killer, method, motive) {
    // 简化的评判逻辑
    const correctKiller = killer === 'onitake';
    const methodContainsKey = method.includes('失手') || method.includes('混乱') || method.includes('推搡');
    const motiveContainsKey = motive.includes('面子') || motive.includes('名誉') || motive.includes('形象');

    return correctKiller && methodContainsKey && motiveContainsKey;
}

function showResult(isCorrect, killer, method, motive) {
    const resultTitle = document.getElementById('result-title');
    const resultContent = document.getElementById('result-content');

    if (isCorrect) {
        resultTitle.textContent = '🎉 破案成功！';
        resultTitle.style.color = '#27ae60';
        resultContent.innerHTML = `
            <h3>恭喜！你成功还原了真相！</h3>
            <p><strong>你的推理：</strong></p>
            <p><strong>凶手：</strong>${suspects[killer]?.name || killer}</p>
            <p><strong>手法：</strong>${method}</p>
            <p><strong>动机：</strong>${motive}</p>
            
            <h3>真相还原：</h3>
            <p>大盗鬼武确实杀死了武士金泽武弘，但过程并非他所说的那样英勇。实际上，鬼武喝了酒，武士又极度恐惧，决斗过程混乱不堪。武士的刀很快就断了，他跪地求饶。在花子夫人的言语刺激下，鬼武失手用匕首杀死了武士。</p>
            <p>花子夫人早已厌倦懦弱的丈夫，她故意挑拨两人决斗，希望借刀杀人。樵夫吉二郎目睹了全过程，事后偷走了那把值钱的匕首。</p>
            <p>每个人都在为自己的利益撒谎：鬼武为了面子，花子为了脱罪，武士之魂为了尊严，樵夫为了掩盖盗窃。</p>
        `;
    } else {
        resultTitle.textContent = '❌ 真相未明';
        resultTitle.style.color = '#e74c3c';
        resultContent.innerHTML = `
            <h3>很遗憾，你的推理还不够准确。</h3>
            <p><strong>你的推理：</strong></p>
            <p><strong>凶手：</strong>${suspects[killer]?.name || killer}</p>
            <p><strong>手法：</strong>${method}</p>
            <p><strong>动机：</strong>${motive}</p>
            
            <h3>提示：</h3>
            <p>真正的凶手确实动手杀了人，但过程可能不像他说的那样光彩。仔细想想现场的证据和每个人证词中的矛盾之处。</p>
            <p>每个人都有自己的秘密和撒谎的理由。试着从他们的性格和动机出发，找出真相。</p>
        `;
    }

    showScreen('result-screen');
    game.gameCompleted = true;
}

// 事件监听器
document.addEventListener('DOMContentLoaded', function () {
    // 开始调查按钮
    document.getElementById('start-investigation').addEventListener('click', () => {
        updateAPIKey();
        showScreen('investigation-screen');
    });

    // 清除进度按钮
    document.getElementById('clear-progress').addEventListener('click', () => {
        if (confirm('确定要清除所有游戏进度吗？')) {
            game.clearGameState();
            alert('游戏进度已清除');
            location.reload();
        }
    });

    // 导航按钮
    document.getElementById('nav-suspects').addEventListener('click', () => showPanel('suspects-panel'));
    document.getElementById('nav-scene').addEventListener('click', () => showPanel('scene-panel'));
    document.getElementById('nav-accusation').addEventListener('click', () => showScreen('accusation-screen'));

    // 审问按钮
    document.querySelectorAll('.interrogate-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const suspectId = e.target.closest('.suspect-card').dataset.suspect;
            startInterrogation(suspectId);
        });
    });

    // 返回按钮
    document.getElementById('back-to-investigation').addEventListener('click', () => {
        showScreen('investigation-screen');
    });

    document.getElementById('back-to-investigation-2').addEventListener('click', () => {
        showScreen('investigation-screen');
    });

    // 聊天输入
    document.getElementById('chat-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });

    document.getElementById('send-message').addEventListener('click', sendMessage);

    // 现场调查 - 图片交互
    document.getElementById('toggle-hotspots').addEventListener('click', toggleHotspots);

    // 初始化现场交互
    initializeSceneInteraction();

    // 结案指认
    document.getElementById('submit-accusation').addEventListener('click', submitAccusation);

    // 重新开始
    document.getElementById('restart-game').addEventListener('click', () => {
        if (confirm('确定要重新开始游戏吗？这将清除所有进度。')) {
            game.clearGameState();
            location.reload();
        }
    });

    // 语音录音按钮
    document.getElementById('voice-record').addEventListener('click', toggleRecording);

    // 语音开关
    document.getElementById('voice-enabled').addEventListener('change', (e) => {
        game.voiceEnabled = e.target.checked;
    });

    // 停止音频按钮
    document.getElementById('stop-audio').addEventListener('click', () => {
        game.voiceManager.stopAudio();
    });

    // 证据出示（事件委托）
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('evidence-btn')) {
            const evidenceId = e.target.dataset.evidence;
            presentEvidence(evidenceId);
        }
    });

    // 初始化游戏
    game.updateEvidenceDisplay();

    // 检查是否是新session
    const isNewSession = !localStorage.getItem('mistTheater_sessionId') ||
        localStorage.getItem('mistTheater_sessionId') !== game.sessionId;

    if (isNewSession) {
        console.log('新的调查session开始 - 证物袋和现场调查已重置');
    }

    console.log('游戏已加载，发现证据数量:', game.evidence.length);
    console.log('对话记录数量:', Object.keys(game.conversations).length);
    console.log('当前session ID:', game.sessionId);
});