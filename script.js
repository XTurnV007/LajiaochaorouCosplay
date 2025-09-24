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
        this.loadGameState();
    }

    saveGameState() {
        const gameData = {
            evidence: this.evidence,
            conversations: this.serializeConversations(),
            sceneInvestigations: this.sceneInvestigations,
            gameCompleted: this.gameCompleted
        };
        localStorage.setItem('mistTheater_gameState', JSON.stringify(gameData));
    }

    loadGameState() {
        try {
            const savedData = localStorage.getItem('mistTheater_gameState');
            if (savedData) {
                const gameData = JSON.parse(savedData);
                this.evidence = gameData.evidence || [];
                this.sceneInvestigations = gameData.sceneInvestigations || [];
                this.gameCompleted = gameData.gameCompleted || false;

                // 恢复对话记录
                if (gameData.conversations) {
                    this.deserializeConversations(gameData.conversations);
                }
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
        initialStatement: "哈哈哈，没错，那武士就是我杀的！我看上了他老婊子的美貌，用计把他们骗进了竹林深处。我把他绑在树上，当着他的面占有了他老婆。那女人刚烈得很，哭喊着让我们决斗，说只能有一个男人活下来。我解开了武士的绳子，跟他堂堂正正地用太刀决斗了二十三回合！最终，我的刀刺穿了他的胸膛。他的眼神？哼，是敬佩，是作为一个武士败给强者的眼神。那女人？趁乱跑了。至于那把名贵的匕首，当然也被我拿走了，那可是我的战利品！",
        secrets: {
            truth: "决斗确实发生了，但过程极其笨拙和可笑。武士吓得腿软，鬼武自己也喝多了酒，根本没有所谓的'二十三回合'。在混乱的推搡中，武士的刀断了，他跪地求饶。鬼武在羞辱他时，失手用匕首将他刺死。",
            motive: "他必须维护自己'强大无匹'的大盗形象。承认自己只是杀死了一个懦夫，并且过程如此狼狈，是比死还难受的耻辱。"
        }
    },
    hana: {
        name: "花子夫人",
        avatar: "🌸",
        personality: "表面柔弱、内心冷酷、善于伪装",
        initialStatement: "那恶鬼……他把夫君绑起来……然后……然后对我施以暴行……我受尽了屈辱。之后，那恶鬼大笑着离开了。我挣扎着爬到夫君身边，用他随身的小刀为他割断了绳索。但我看到他看我的眼神……那不是怜悯，是鄙夷，是冰冷的嫌弃！我一个受辱的女人，怎么能承受这样的眼神？我昏了过去，等我醒来时，只看到夫君胸前插着那把小刀，已经……已经自尽了。是我害了他……是我……",
        secrets: {
            truth: "她早已厌倦了软弱无能的丈夫。被鬼武侵犯后，她发现这是一个摆脱丈夫的机会。她并没有哭喊，反而用语言刺激和挑拨两人，嘲笑丈夫的懦弱，赞美强盗的勇猛，一手促成了这场决斗。",
            motive: "她要将自己塑造成一个无辜、贞洁、可怜的受害者，并将丈夫的死归结于他自己的'羞愧自尽'，从而洗清自己所有的责任。"
        }
    },
    spirit: {
        name: "金泽武弘之魂",
        avatar: "👻",
        personality: "庄严、虚伪、死要面子",
        initialStatement: "我，金泽武弘……在妻子受辱后，那强盗解开了我。但我无法洗刷这耻辱。我的妻子，她用最决绝的眼神看着我，递给我那把家传的蓝色丝绸柄的匕首，示意我必须做出武士的了断。我……我接受了我的命运。在强盗和妻子离开后，我面向西方，切腹自尽，保留了最后的尊严。我的灵魂因此得以安息。",
        secrets: {
            truth: "他根本没有切腹自尽。在决斗中，他表现得极其懦弱，刀断后立刻跪地求饶。他是被鬼武在混乱中失手杀死的。",
            motive: "作为一个武士，承认自己是'跪着被杀'的，是对其身份、荣誉乃至整个家族的终极侮辱。他的鬼魂为了维护自己生前的'武士道'尊严，编造了最高尚的死法——切腹。"
        }
    },
    woodcutter: {
        name: "樵夫吉二郎",
        avatar: "🪓",
        personality: "胆小、贪婪、狡猾",
        initialStatement: "大人，我冤枉啊！我就是个砍柴的。今天早上，我进竹林，想找个好点的地方，结果走着走着，就看到……就看到那具尸体躺在那儿！旁边只有一把断了的太刀，别的什么都没有。吓得我魂飞魄散，连滚带爬地就去报官了。我什么都没看见，什么都没拿啊！",
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
        let prompt = `你正在扮演《竹林之下》案件中的角色：${suspect.name}。

角色设定：
- 性格：${suspect.personality}
- 公开证词：${suspect.initialStatement}
- 真实秘密：${suspect.secrets.truth}
- 撒谎动机：${suspect.secrets.motive}

当前压力等级：${this.stressLevel}/5

角色扮演规则：
1. 严格按照角色性格和动机回答
2. 坚持你的谎言，除非压力过大才可能透露真相
3. 对质疑和证据要有相应的情绪反应
4. 保持角色的语言风格和时代背景
5. 回答要简洁，不超过100字

`;

        if (presentedEvidence) {
            prompt += `\n玩家刚刚出示了证据：${presentedEvidence.name} - ${presentedEvidence.description}
你需要对这个证据做出反应，可能会感到紧张、愤怒或试图解释。`;
            this.stressLevel += 1;
        }

        return prompt;
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
        const lowerMessage = message.toLowerCase();
        const suspectId = this.suspectId;

        // 如果出示了证据
        if (evidence) {
            return this.handleEvidencePresentation(evidence, message);
        }

        // 根据不同角色和问题类型生成回应
        if (suspectId === 'onitake') {
            return this.generateOnitakeResponse(lowerMessage);
        } else if (suspectId === 'hana') {
            return this.generateHanaResponse(lowerMessage);
        } else if (suspectId === 'spirit') {
            return this.generateSpiritResponse(lowerMessage);
        } else if (suspectId === 'woodcutter') {
            return this.generateWoodcutterResponse(lowerMessage);
        }

        return "我已经说了我知道的一切。";
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
        const evidenceId = evidence.id;
        const suspectId = this.suspectId;

        this.stressLevel += 1;

        if (suspectId === 'onitake') {
            if (evidenceId === 'trampled_area') {
                return "（有些慌张）那...那是因为我们战斗得太激烈了！二十三回合的决斗当然会把周围弄得一团糟！";
            } else if (evidenceId === 'broken_sword') {
                return "（不屑）那武士的刀质量太差了，在我的神刀面前当然会断！这证明了我的实力！";
            } else if (evidenceId === 'missing_dagger') {
                this.stressLevel += 2;
                return "（紧张）我...我说了那是我的战利品！打败敌人，拿走他的武器，这是理所当然的！";
            }
        } else if (suspectId === 'hana') {
            if (evidenceId === 'rope_and_hairpin') {
                this.stressLevel += 2;
                return "（慌乱）那个银簪...我当时太害怕了，在逃跑的时候一定是掉了...我什么都记不清了...";
            } else if (evidenceId === 'trampled_area') {
                return "（颤抖）现场那么混乱...我当时只想逃离那个可怕的地方...";
            } else if (evidenceId === 'missing_dagger') {
                return "（哭泣）那把刀...夫君用它结束了自己的生命...我不知道后来它去哪了...";
            }
        } else if (suspectId === 'spirit') {
            if (evidenceId === 'broken_sword') {
                this.stressLevel += 2;
                return "（愤怒）我的刀断了是因为...是因为那强盗的武器太过凶恶！但我依然保持了武士的尊严！";
            } else if (evidenceId === 'missing_dagger') {
                return "（平静）我用那把匕首完成了切腹仪式...至于它后来去了哪里，我就不知道了...";
            }
        } else if (suspectId === 'woodcutter') {
            if (evidenceId === 'missing_dagger') {
                this.stressLevel += 3;
                return "（极度紧张）匕首？我...我真的没看到什么匕首！现场什么都没有！";
            } else if (evidenceId === 'trampled_area') {
                this.stressLevel += 2;
                return "（结巴）现场...现场确实很乱...但我到的时候就已经这样了！";
            }
        }

        return "（看着证据，显得紧张）这...这个我不太清楚...";
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
    
    const resultsContainer = document.getElementById('scene-results');
    const resultDiv = document.createElement('div');
    resultDiv.className = 'scene-result';
    
    let investigationRecord = {
        command: clueKey,
        timestamp: new Date().toLocaleTimeString()
    };
    
    if (foundClue) {
        resultDiv.innerHTML = `<strong>调查结果：</strong>${foundClue.result}`;
        investigationRecord.result = foundClue.result;
        
        if (foundClue.evidence) {
            game.addEvidence(foundClue.evidence);
            resultDiv.innerHTML += `<br><strong>发现证据：</strong>${foundClue.evidence.name}`;
            investigationRecord.evidence = foundClue.evidence.name;
        }
        
        // 标记热点为已调查
        const hotspot = document.querySelector(`[data-clue="${clueKey}"]`);
        if (hotspot) {
            hotspot.classList.add('investigated');
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

// 重置现场视图
function resetSceneView() {
    const hotspots = document.querySelectorAll('.hotspot');
    hotspots.forEach(hotspot => {
        hotspot.classList.remove('investigated');
    });
    
    const resultsContainer = document.getElementById('scene-results');
    if (confirm('确定要清除所有调查记录吗？')) {
        resultsContainer.innerHTML = '';
        game.sceneInvestigations = [];
        game.saveGameState();
    }
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
    document.getElementById('nav-evidence').addEventListener('click', () => showPanel('evidence-panel'));
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
    document.getElementById('reset-scene').addEventListener('click', resetSceneView);
    
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

    // 如果有保存的现场调查记录，在切换到现场面板时会自动恢复
    console.log('游戏已加载，发现证据数量:', game.evidence.length);
    console.log('对话记录数量:', Object.keys(game.conversations).length);
});