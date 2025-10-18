// 语音功能类
class VoiceManager {
    constructor() {
        this.currentAudio = null;
        this.currentAudioUrl = null;
    }





    // 获取角色的音色
    getVoiceForCharacter(characterId) {
        return VOICE_CONFIG.CHARACTER_VOICES[characterId] || VOICE_CONFIG.DEFAULT_VOICE;
    }



    async textToSpeech(text, characterId = null) {


        // 根据角色选择音色
        const voiceType = characterId ? this.getVoiceForCharacter(characterId) : VOICE_CONFIG.DEFAULT_VOICE;
        const characterName = characterId ? suspects[characterId]?.name : '系统';



        try {
            // 使用正确的七牛云TTS格式
            const requestBody = {
                audio: {
                    voice_type: voiceType,
                    encoding: "mp3",
                    speed_ratio: 1.0
                },
                request: {
                    text: text
                }
            };



            const response = await fetch(`${AI_CONFIG.BASE_URL}/voice/tts`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_CONFIG.API_KEY}`
                },
                body: JSON.stringify(requestBody)
            });



            if (!response.ok) {
                const errorText = await response.text();

                throw new Error(`TTS请求失败: ${response.status} - ${errorText}`);
            }

            // 根据文档，响应是JSON格式，包含base64编码的音频数据
            const data = await response.json();


            if (data.data) {
                // 将base64音频数据转换为blob
                const audioData = atob(data.data);
                const audioArray = new Uint8Array(audioData.length);
                for (let i = 0; i < audioData.length; i++) {
                    audioArray[i] = audioData.charCodeAt(i);
                }

                const audioBlob = new Blob([audioArray], { type: 'audio/mp3' });




                const audioUrl = URL.createObjectURL(audioBlob);

                await this.playAudio(audioUrl);
            } else {

            }
        } catch (error) {

        }
    }

    async playAudio(audioUrl) {


        try {
            // 停止当前播放的音频
            if (this.currentAudio) {

                this.currentAudio.pause();
                // 如果是blob URL，需要释放
                if (this.currentAudioUrl && this.currentAudioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(this.currentAudioUrl);
                }
                this.currentAudio = null;
            }


            this.currentAudio = new Audio(audioUrl);
            this.currentAudioUrl = audioUrl;

            // 添加音频事件监听器






            this.currentAudio.addEventListener('ended', () => {
                // 播放结束后释放blob URL
                if (this.currentAudioUrl && this.currentAudioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(this.currentAudioUrl);
                    this.currentAudioUrl = null;
                }
            });

            this.currentAudio.addEventListener('error', (e) => {
                // 出错时也要释放blob URL
                if (this.currentAudioUrl && this.currentAudioUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(this.currentAudioUrl);
                    this.currentAudioUrl = null;
                }
            });

            await this.currentAudio.play();

        } catch (error) {

        }
    }

    stopAudio() {

        if (this.currentAudio) {
            this.currentAudio.pause();
            // 释放blob URL
            if (this.currentAudioUrl && this.currentAudioUrl.startsWith('blob:')) {
                URL.revokeObjectURL(this.currentAudioUrl);
                this.currentAudioUrl = null;
            }
            this.currentAudio = null;

        } else {

        }
    }
}

// 游戏状态管理
class GameState {
    constructor() {
        this.currentScreen = 'cover';
        this.currentSuspect = null;
        this.evidence = [];
        this.conversations = {};
        this.sceneInvestigations = [];
        this.gameCompleted = false;
        this.voiceManager = new VoiceManager();
        this.voiceEnabled = false;
        this.sessionId = this.generateSessionId();
        this.hasSeenCover = false; // 跟踪是否已经看过封面页
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
            sessionId: this.sessionId,
            hasSeenCover: this.hasSeenCover,
            voiceEnabled: this.voiceEnabled
        };
        localStorage.setItem('mistTheater_gameState', JSON.stringify(gameData));
        localStorage.setItem('mistTheater_sessionId', this.sessionId);
    }

    loadGameState() {
        try {
            const savedData = localStorage.getItem('mistTheater_gameState');
            const savedSessionId = localStorage.getItem('mistTheater_sessionId');
            
            // 检查用户是否曾经看过封面页（跨session保存）
            const hasSeenCover = localStorage.getItem('mistTheater_hasSeenCover') === 'true';
            this.hasSeenCover = hasSeenCover;

            // 检查是否是同一个session
            if (savedData && savedSessionId === this.sessionId) {
                const gameData = JSON.parse(savedData);

                // 同一session，恢复所有数据
                this.evidence = gameData.evidence || [];
                this.sceneInvestigations = gameData.sceneInvestigations || [];
                this.gameCompleted = gameData.gameCompleted || false;
                this.hasSeenCover = gameData.hasSeenCover || hasSeenCover;
                this.voiceEnabled = gameData.voiceEnabled || false;

                // 恢复对话记录
                if (gameData.conversations) {
                    this.deserializeConversations(gameData.conversations);
                }
            } else {
                // 新session，只恢复对话记录和语音设置，重置证物袋和现场调查
                if (savedData) {
                    const gameData = JSON.parse(savedData);

                    // 只恢复对话记录和语音设置
                    if (gameData.conversations) {
                        this.deserializeConversations(gameData.conversations);
                    }
                    
                    // 保留封面页查看状态和语音设置
                    this.hasSeenCover = gameData.hasSeenCover || hasSeenCover;
                    this.voiceEnabled = gameData.voiceEnabled || false;
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
        localStorage.removeItem('mistTheater_hasSeenCover');
        this.hasSeenCover = false;
    }
    
    // 标记用户已经看过封面页
    markCoverSeen() {
        this.hasSeenCover = true;
        localStorage.setItem('mistTheater_hasSeenCover', 'true');
        this.saveGameState();
    }

    addEvidence(evidence) {
        if (!this.evidence.find(e => e.id === evidence.id)) {
            this.evidence.push(evidence);
            this.updateEvidenceDisplay();
            this.saveGameState();
        }
    }

    updateEvidenceDisplay() {
        console.log('🔄 updateEvidenceDisplay called, evidence count:', this.evidence.length);
        const evidenceList = document.getElementById('evidence-list');
        const availableEvidence = document.getElementById('available-evidence');
        const chatAvailableEvidence = document.getElementById('chat-available-evidence');

        console.log('📦 Elements found:', {
            evidenceList: !!evidenceList,
            availableEvidence: !!availableEvidence,
            chatAvailableEvidence: !!chatAvailableEvidence,
            chatAvailableEvidenceContent: chatAvailableEvidence ? chatAvailableEvidence.innerHTML : 'N/A'
        });

        if (this.evidence.length === 0) {
            console.log('📭 No evidence found');
            evidenceList.innerHTML = '<p class="no-evidence">暂无发现的证物</p>';
            if (availableEvidence) availableEvidence.innerHTML = '<span>可出示证据：暂无证据</span>';
            if (chatAvailableEvidence) chatAvailableEvidence.innerHTML = '<span>可出示证据：暂无证据</span>';
        } else {
            console.log('📋 Processing evidence items:', this.evidence.length);
            evidenceList.innerHTML = this.evidence.map(e =>
                `<div class="evidence-item" data-evidence="${e.id}">
                    ${e.image ? `<img src="${e.image}" alt="${e.name}" class="evidence-image">` : ''}
                    <div class="evidence-content">
                        <h4>${e.name}</h4>
                        <p>${e.description}</p>
                    </div>
                </div>`
            ).join('');

            // 更新审问界面证据工具栏
            if (availableEvidence) {
                console.log('🔧 Updating interrogation evidence toolbar');
                const evidenceButtons = this.evidence.map(e =>
                    `<button class="evidence-btn" data-evidence="${e.id}" title="${e.description}">
                        <span>${e.name}</span>
                    </button>`
                ).join('');
                availableEvidence.innerHTML = evidenceButtons;
                console.log('✅ Interrogation evidence buttons generated:', this.evidence.length);

                // 重新绑定事件监听器（防重复绑定）
                if (!availableEvidence.__bound) {
                    availableEvidence.__bound = true;
                    availableEvidence.addEventListener('click', (e) => {
                    console.log('🎯 Available evidence container clicked, target:', e.target);

                    // 检查点击的元素或其父元素是否是evidence-btn
                    let evidenceBtn = null;
                    if (e.target.classList.contains('evidence-btn')) {
                        evidenceBtn = e.target;
                    } else if (e.target.parentElement && e.target.parentElement.classList.contains('evidence-btn')) {
                        evidenceBtn = e.target.parentElement;
                    }

                    if (evidenceBtn) {
                            e.preventDefault();
                            e.stopPropagation();
                        const evidenceId = evidenceBtn.dataset.evidence;
                        console.log('🔧 Available evidence button clicked:', evidenceId);
                        presentEvidence(evidenceId);
                    } else {
                        console.log('❌ Available container click - not an evidence button or its child');
                    }
                    });
                }
            }

            // 更新聊天界面证据工具栏
            if (chatAvailableEvidence) {
                console.log('💬 Updating chat evidence toolbar');
                console.log('📋 Evidence items for chat:', this.evidence.map(e => ({ id: e.id, name: e.name })));
                const chatEvidenceButtons = this.evidence.map(e =>
                    `<button class="evidence-btn" data-evidence="${e.id}" title="${e.description}">
                        <span>${e.name}</span>
                    </button>`
                ).join('');
                console.log('🔧 Generated HTML:', chatEvidenceButtons);
                chatAvailableEvidence.innerHTML = chatEvidenceButtons;
                console.log('✅ Chat evidence buttons generated:', this.evidence.length);
                console.log('📦 Final chat container content:', chatAvailableEvidence.innerHTML);

            // 重新绑定事件监听器（防重复绑定）
            if (!chatAvailableEvidence.__bound) {
                chatAvailableEvidence.__bound = true;
                chatAvailableEvidence.addEventListener('click', (e) => {
                    console.log('🎯 Chat evidence container clicked, target:', e.target);
                    console.log('🎯 Target classes:', e.target.classList);
                    console.log('🎯 Target parent:', e.target.parentElement);
                    console.log('🎯 Parent classes:', e.target.parentElement?.classList);

                    // 检查点击的元素或其父元素是否是evidence-btn
                    let evidenceBtn = null;
                    if (e.target.classList.contains('evidence-btn')) {
                        evidenceBtn = e.target;
                    } else if (e.target.parentElement && e.target.parentElement.classList.contains('evidence-btn')) {
                        evidenceBtn = e.target.parentElement;
                    }

                    if (evidenceBtn) {
                        e.preventDefault();
                        e.stopPropagation();
                        const evidenceId = evidenceBtn.dataset.evidence;
                        console.log('💬 Chat evidence button clicked:', evidenceId);
                        presentEvidence(evidenceId);
                    } else {
                        console.log('❌ Chat container click - not an evidence button or its child');
                    }
                });
            }
            } else {
                console.log('❌ Chat available evidence element not found');
            }
        }
    }
}

// AI角色数据
const suspects = {
    onitake: {
        name: "大盗\"鬼武\"",
        avatar: "🗡️",
        image: "images/characters/onitake.png",
        personality: "粗暴、自负、好面子",
        voiceStyle: "粗犷低沉的男声",
        initialStatement: "哈哈哈，没错，那家伙就是老子杀的！我看上了他老婆的美貌，设计把他们骗到了竹林里。我把他绑在树上，当着他的面强暴了他老婆。那女人很刚烈，哭着喊着要我们决斗，说只能活一个。我解开了那家伙的绳子，跟他正面决斗了二十三回合！最后，我一刀刺穿了他的胸膛。他临死前的眼神？哼，那是敬佩，是败给强者的眼神。那女人趁乱跑了。至于那把值钱的匕首，当然被我拿走了，那是我的战利品！",
        secrets: {
            truth: "决斗确实发生了，但过程极其笨拙和可笑。武士吓得腿软，鬼武自己也喝多了酒，根本没有所谓的'二十三回合'。在混乱的推搡中，武士的刀断了，他跪地求饶。鬼武在羞辱他时，失手用匕首将他刺死。",
            motive: "他必须维护自己'强大无匹'的大盗形象。承认自己只是杀死了一个懦夫，并且过程如此狼狈，是比死还难受的耻辱。"
        }
    },
    hana: {
        name: "花子夫人",
        avatar: "🌸",
        image: "images/characters/hana.png",
        personality: "表面柔弱、内心冷酷、善于伪装",
        voiceStyle: "柔美温婉的女声",
        initialStatement: "那个坏人...他把我丈夫绑起来...然后...然后对我做了那种事...我受尽了屈辱。之后，那个坏人大笑着走了。我挣扎着爬到我丈夫身边，用他身上的小刀给他割断了绳子。但是我看到他看我的眼神...那不是同情，是嫌弃，是冰冷的嫌弃！我一个被玷污的女人，怎么能承受这样的眼神？我昏过去了，等我醒来的时候，只看到我丈夫胸前插着那把小刀，已经...已经自杀了。都是我害了他...都是我...",
        secrets: {
            truth: "她早已厌倦了软弱无能的丈夫。被鬼武侵犯后，她发现这是一个摆脱丈夫的机会。她并没有哭喊，反而用语言刺激和挑拨两人，嘲笑丈夫的懦弱，赞美强盗的勇猛，一手促成了这场决斗。",
            motive: "她要将自己塑造成一个无辜、贞洁、可怜的受害者，并将丈夫的死归结于他自己的'羞愧自尽'，从而洗清自己所有的责任。"
        }
    },
    spirit: {
        name: "金泽武弘之魂",
        avatar: "👻",
        image: "images/characters/spirit.png",
        personality: "庄严、虚伪、死要面子",
        voiceStyle: "庄严威严的男声",
        initialStatement: "我是金泽武弘...在我妻子被那个强盗侮辱之后，那强盗解开了我的绳子。但是我无法洗刷这个耻辱。我的妻子，她用最决绝的眼神看着我，把那把家传的蓝色丝绸柄匕首递给我，示意我必须做出了断。我...我接受了我的命运。在强盗和妻子都离开后，我面向西方，用那把匕首切腹自尽，保住了最后的尊严。我的灵魂因此得到了安息。",
        secrets: {
            truth: "他根本没有切腹自尽。在决斗中，他表现得极其懦弱，刀断后立刻跪地求饶。他是被鬼武在混乱中失手杀死的。",
            motive: "作为一个武士，承认自己是'跪着被杀'的，是对其身份、荣誉乃至整个家族的终极侮辱。他的鬼魂为了维护自己生前的'武士道'尊严，编造了最高尚的死法——切腹。"
        }
    },
    woodcutter: {
        name: "樵夫吉二郎",
        avatar: "🪓",
        image: "images/characters/woodcutter.png",
        personality: "胆小、贪婪、狡猾",
        voiceStyle: "朴实憨厚的男声",
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
            description: "竹子上的绳索磨损痕迹，证明确实发生过捆绑",
            image: "images/items/rope_marks.png"
        }
    },
    "搜索地面": {
        result: "你在地面上发现了一截廉价的草绳，还有一个精致的银簪掉落在泥地里。",
        evidence: {
            id: "rope_and_hairpin",
            name: "草绳和银簪",
            description: "一截普通的草绳和一个精致的银簪，银簪应该属于花子夫人",
            image: "images/items/rope_and_hairpin.png"
        }
    },
    "检查武器": {
        result: "你发现了一把从中间断裂的太刀，刀身质量似乎不佳。奇怪的是，武士腰间的匕首鞘是空的。",
        evidence: {
            id: "broken_sword",
            name: "断裂的太刀",
            description: "武士的太刀从中间断裂，说明战斗激烈但兵器质量不佳",
            image: "images/items/broken_sword.png"
        }
    },
    "调查周围": {
        result: "周围的茶花丛被踩得一塌糊涂，范围很大。这不像一场有礼有节的决斗，更像一场混乱的扭打。你还发现了一个倾倒的酒壶。",
        evidence: {
            id: "trampled_area",
            name: "凌乱的现场",
            description: "大范围的茶花丛被踩踏，还有一个倾倒的酒壶，说明战斗混乱且有人喝了酒",
            image: "images/items/trampled_area.png"
        }
    },
    "寻找匕首": {
        result: "你仔细搜索了整个现场，但没有找到那把应该在武士腰间的匕首。这把匕首似乎消失了。",
        evidence: {
            id: "missing_dagger",
            name: "消失的匕首",
            description: "武士腰间的匕首鞘是空的，凶器不见了踪影",
            image: "images/items/missing_dagger.png"
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

// 语音配置 - 为不同角色配置不同音色
const VOICE_CONFIG = {
    // 默认音色
    DEFAULT_VOICE: 'qiniu_zh_female_wwxkjx',

    // 角色音色映射 - 手动指定
    CHARACTER_VOICES: {
        'onitake': 'qiniu_zh_male_ybxknjs',    // 大盗"鬼武"
        'hana': 'qiniu_zh_female_wwkjby',       // 花子夫人
        'spirit': 'qiniu_zh_male_wncwxz',     // 金泽武弘之魂
        'woodcutter': 'qiniu_zh_male_cxkjns'  // 樵夫吉二郎
    }
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

        // 如果出示了证据，处理压力等级变化
        if (presentedEvidence) {
            const stressIncrease = this.getStressIncrease(presentedEvidence.id, this.suspectId);
            this.stressLevel += stressIncrease;
            console.log(`${this.suspect.name} 压力等级增加 ${stressIncrease}，当前等级: ${this.stressLevel}`);
        } else {
            // 根据对话内容增加压力
            const conversationStress = this.getConversationStress(playerMessage);
            if (conversationStress > 0) {
                this.stressLevel += conversationStress;
                console.log(`${this.suspect.name} 对话压力增加 ${conversationStress}，当前等级: ${this.stressLevel}`);
            }
        }

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

    // 根据对话内容计算压力增加
    getConversationStress(message) {
        const lowerMessage = message.toLowerCase();
        const suspectId = this.suspectId;
        
        // 不同角色对不同话题的敏感度
        const stressKeywords = {
            'onitake': {
                '懦弱|害怕|胆小|酒|喝醉': 1,
                '失手|推搡|混乱|笨拙': 2
            },
            'hana': {
                '挑拨|刺激|厌倦|不爱': 1,
                '计划|设计|故意': 2
            },
            'spirit': {
                '跪|求饶|懦弱|害怕': 2,
                '切腹|自杀|尊严': 1
            },
            'woodcutter': {
                '偷|拿走|贪心|躲藏': 1,
                '目击|看到|全程': 2
            }
        };

        const keywords = stressKeywords[suspectId] || {};
        for (const [pattern, stress] of Object.entries(keywords)) {
            const regex = new RegExp(pattern);
            if (regex.test(lowerMessage)) {
                return stress;
            }
        }
        
        return 0;
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
2. **情绪表达**：用拟声词表达情绪，不要用说明性语言，如"呜呜..."、"啊啊！"、"哼！"等
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
- 拟声词表达：愤怒时"哼！"，紧张时"呃..."，自负时"哈！"
- 说话示例："哼！老子就是杀了他！"、"那家伙太弱了！"

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
- 拟声词表达：悲伤时"呜呜..."，慌乱时"啊..."，紧张时"嗯..."
- 说话示例："呜呜...我真的很害怕..."、"啊...我什么都不知道..."、"那个坏人..."

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
- 拟声词表达：愤怒时"呵！"，庄严时"嗯..."，屈辱时"啊啊..."
- 说话示例："呵！我是有尊严地死去的"、"嗯...我绝不会做那种事"、"作为武士..."

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
- 拟声词表达：紧张时"呃..."，恐慌时"啊啊..."，结巴时"我...我"
- 说话示例："呃...我...我真不知道"、"啊啊...我就是个普通人"、"我发誓没撒谎"

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
                'broken_sword': '这个证据让你紧张！呃...哼！你需要为自己的"实力"辩护，但要显得有些心虚。压力+2。',
                'trampled_area': '这个证据让你慌张！啊啊...你需要解释战斗的激烈，但要露出破绽。压力+2。',
                'missing_dagger': '这个证据让你极度紧张！哈...你声称拿走了匕首，但要表现得心虚。压力+3。',
                'rope_marks': '这个证据对你有利！你可以得意地说"哼！这证明了我的说法"。',
                'default': '你对这个证据不太在意，表现得漠不关心，说"哈！专心对付武士没注意别的"。'
            },
            'hana': {
                'rope_and_hairpin': '这个证据让你极度慌乱！啊啊...银簪是你最大的破绽，你需要拼命解释"呜呜...我不知道这怎么会在那里..."。压力+4。',
                'missing_dagger': '这个证据让你紧张！嗯...你知道真相但要撒谎，眼神要闪烁。压力+2。',
                'default': '你表现得像无辜的受害者，说"呜呜...太害怕了什么都记不清楚"。'
            },
            'spirit': {
                'broken_sword': '这个证据让你极度愤怒！呵！这戳中了你的痛处，你要愤怒地为自己辩护"嗯！我绝不会在战斗中表现懦弱！"。压力+4。',
                'missing_dagger': '这个证据让你有些紧张！嗯...你要维护切腹的谎言。压力+1。',
                'default': '你表现得超然，说"呵...已经死了不在乎这些尘世的物证"。'
            },
            'woodcutter': {
                'missing_dagger': '这个证据让你极度恐慌！啊啊...这是你的致命弱点，你要拼命否认"呃...我...我什么都没拿！"。压力+5。',
                'default': '你表现得胆怯但诚实，说"呃...我自己只是砍柴的什么都不懂"。'
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
                "哼！我已经告诉你真相了！还有什么好问的？",
                "呃...那武士就是我杀的，这有什么好怀疑的？",
                "哈！我鬼武从不说谎！"
            ],
            'hana': [
                "呜呜...我...我已经说了我知道的一切...",
                "啊...请不要再逼我回忆那些可怕的事情...",
                "呜呜...我只是个可怜的女人..."
            ],
            'spirit': [
                "嗯...我已经告诉了你事情的真相...",
                "呵...我已经死了，这些对我来说已经不重要了...",
                "嗯！武士的话就是真理。"
            ],
            'woodcutter': [
                "呃...我...我真的什么都不知道...",
                "我...我只是个砍柴的，什么都不懂...",
                "啊啊...我发誓我说的都是真的！"
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
    // 如果是封面页面，直接显示
    if (screenId === 'cover') {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById('cover-screen').classList.add('active');
        document.body.classList.add('cover-active'); // 禁用body滚动
        closeBriefingModal();
        game.currentScreen = screenId;
        return;
    }

    // 如果是案件陈述页面，显示信封弹框
    if (screenId === 'briefing-screen') {
        document.body.classList.remove('cover-active'); // 恢复body滚动
        showBriefingModal();
        game.currentScreen = screenId;
        return;
    }

    // 其他游戏页面全屏显示
    document.body.classList.remove('cover-active'); // 恢复body滚动
    closeBriefingModal();
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    game.currentScreen = screenId;
}

// 显示案件陈述信封弹框
function showBriefingModal() {
    const modal = document.getElementById('briefing-modal');
    modal.classList.remove('hidden');
    document.body.classList.add('briefing-open');
}

// 关闭案件陈述信封弹框
function closeBriefingModal() {
    const modal = document.getElementById('briefing-modal');
    modal.classList.add('hidden');
    document.body.classList.remove('briefing-open');
}

// 初始化信封弹框控制
function initializeBriefingControls() {
    const modal = document.getElementById('briefing-modal');
    const startBtn = document.getElementById('start-investigation-envelope');
    const closeBtn = document.getElementById('close-briefing');
    const briefingOverlay = document.querySelector('.briefing-overlay');
    
    // 开始调查按钮事件 - 直接进入嫌疑人页面
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            updateAPIKey();
            closeBriefingModal();
            showScreen('investigation-screen');
            showPanel('scene-panel'); // 直接显示现场调查面板
        });
    }
    
    // 关闭按钮事件
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            closeBriefingModal();
            showScreen('cover');
        });
    }
    
    // 点击遮罩层关闭弹框
    if (briefingOverlay) {
        briefingOverlay.addEventListener('click', () => {
            closeBriefingModal();
            showScreen('cover');
        });
    }
    
    // ESC键关闭弹框
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal && !modal.classList.contains('hidden')) {
            closeBriefingModal();
            showScreen('cover');
        }
    });
}

// 封面页控制
function initializeCover() {
    // 添加页面加载完成的淡入效果
    setTimeout(() => {
        document.body.style.opacity = '1';
    }, 100);

    // 检查背景图片是否加载成功
    const testImg = new Image();
    testImg.onload = function() {
        console.log('封面背景图片加载成功');
    };
    testImg.onerror = function() {
        console.warn('封面背景图片加载失败');
        // 如果图片加载失败，可以在这里添加备用处理
    };
    testImg.src = 'images/cover.png';
    const enterGameBtn = document.getElementById('enter-game');
    const showSettingsBtn = document.getElementById('show-settings');
    const saveSettingsBtn = document.getElementById('save-settings');
    const clearProgressBtn = document.getElementById('clear-progress');
    const settingsPanel = document.getElementById('settings-panel');
    const apiKeyInput = document.getElementById('api-key-input');

    // 进入游戏
    enterGameBtn.addEventListener('click', () => {
        // 保存API密钥设置
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            AI_CONFIG.API_KEY = apiKey;
            localStorage.setItem('mistTheater_apiKey', apiKey);
        }
        
        // 标记封面已经看过
        game.markCoverSeen();
        
        showScreen('briefing-screen');
        
        // 添加进入游戏的音效（如果有的话）
        playTransitionEffect();
    });
    
    // 信封弹框控制
    initializeBriefingControls();

    // 显示设置
    showSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });

    // 保存设置
    saveSettingsBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            AI_CONFIG.API_KEY = apiKey;
            localStorage.setItem('mistTheater_apiKey', apiKey);
            showNotification('设置已保存', 'success');
        } else {
            localStorage.removeItem('mistTheater_apiKey');
            showNotification('已清除API密钥设置', 'info');
        }
        settingsPanel.classList.add('hidden');
    });

    // 清除进度
    clearProgressBtn.addEventListener('click', () => {
        if (confirm('确定要清除所有游戏进度吗？此操作不可恢复。')) {
            game.clearGameState();
            localStorage.removeItem('mistTheater_apiKey');
            showNotification('游戏进度已清除', 'success');
            // 重新加载页面
            setTimeout(() => {
                location.reload();
            }, 1000);
        }
    });

    // 加载保存的API密钥
    const savedApiKey = localStorage.getItem('mistTheater_apiKey');
    if (savedApiKey) {
        apiKeyInput.value = savedApiKey;
        AI_CONFIG.API_KEY = savedApiKey;
    }

    // 点击设置面板外部关闭
    settingsPanel.addEventListener('click', (e) => {
        if (e.target === settingsPanel) {
            settingsPanel.classList.add('hidden');
        }
    });

    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        // ESC键关闭设置面板
        if (e.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
            settingsPanel.classList.add('hidden');
        }
        
        // Enter键进入游戏（当焦点不在输入框时）
        if (e.key === 'Enter' && document.activeElement.tagName !== 'INPUT' && game.currentScreen === 'cover') {
            enterGameBtn.click();
        }
        
        // 空格键也可以进入游戏
        if (e.key === ' ' && document.activeElement.tagName !== 'INPUT' && game.currentScreen === 'cover') {
            e.preventDefault();
            enterGameBtn.click();
        }
    });

    // 添加鼠标移动效果
    document.addEventListener('mousemove', (e) => {
        if (game.currentScreen === 'cover') {
            const { clientX, clientY } = e;
            const { innerWidth, innerHeight } = window;
            
            const xPercent = (clientX / innerWidth - 0.5) * 2;
            const yPercent = (clientY / innerHeight - 0.5) * 2;
            
            // 轻微的视差效果
            const coverContent = document.querySelector('.cover-content');
            if (coverContent) {
                coverContent.style.transform = `translate(${xPercent * 5}px, ${yPercent * 5}px)`;
            }
            
            // 叶子跟随鼠标轻微移动
            document.querySelectorAll('.floating-leaf').forEach((leaf, index) => {
                const multiplier = (index + 1) * 2;
                leaf.style.transform = `translate(${xPercent * multiplier}px, ${yPercent * multiplier}px)`;
            });
        }
    });
}

// 过渡效果
function playTransitionEffect() {
    // 可以添加音效或其他过渡效果
    console.log('进入游戏...');
}

// 通知系统
function showNotification(message, type = 'info') {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // 添加样式
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        padding: '15px 20px',
        borderRadius: '8px',
        color: 'white',
        fontWeight: '600',
        zIndex: '9999',
        opacity: '0',
        transform: 'translateX(100%)',
        transition: 'all 0.3s ease'
    });

    // 根据类型设置背景色
    switch (type) {
        case 'success':
            notification.style.background = '#27ae60';
            break;
        case 'error':
            notification.style.background = '#e74c3c';
            break;
        case 'warning':
            notification.style.background = '#f39c12';
            break;
        default:
            notification.style.background = '#3498db';
    }

    document.body.appendChild(notification);

    // 显示动画
    setTimeout(() => {
        notification.style.opacity = '1';
        notification.style.transform = 'translateX(0)';
    }, 100);

    // 自动隐藏
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function showPanel(panelId) {
    document.querySelectorAll('.panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const targetPanel = document.getElementById(panelId);
    const targetNavBtn = document.getElementById(`nav-${panelId.replace('-panel', '')}`);
    
    if (targetPanel) targetPanel.classList.add('active');
    if (targetNavBtn) targetNavBtn.classList.add('active');

    // 如果切换到现场调查面板，恢复调查记录和状态
    if (panelId === 'scene-panel') {
        restoreSceneInvestigations();
        restoreSceneState();
        // 调整热点位置以确保位置正确
        setTimeout(adjustHotspotPositions, 100);
    }
    
    // 如果切换到嫌疑人面板，同步语音状态
    if (panelId === 'suspects-panel') {
        console.log('🎯 切换到嫌疑人面板:', panelId);
        setTimeout(() => {
            console.log('🎯 嫌疑人面板激活，当前语音状态:', game.voiceEnabled);
            console.log('📋 证据数量:', game.evidence.length);
            syncAllVoiceCheckboxes();
            console.log('✅ 嫌疑人面板语音状态已同步完成');
            // 确保证据显示正确
            game.updateEvidenceDisplay();
            console.log('🔄 证据显示已更新');
        }, 50);
    }
}

function restoreSceneInvestigations() {
    const resultsContainer = document.querySelector('.scene-chat-messages');
    if (!resultsContainer) return;

    // 保留系统提示消息
    const systemMessage = resultsContainer.querySelector('.scene-chat-message.system');
    resultsContainer.innerHTML = '';
    if (systemMessage) {
        resultsContainer.appendChild(systemMessage);
    }

    game.sceneInvestigations.forEach(record => {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'scene-chat-message investigation';

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        let content = `<strong>调查结果：</strong>${record.result}`;
        if (record.evidence) {
            content += `<br><strong>发现证据：</strong>${record.evidence}`;
        }
        contentDiv.innerHTML = content;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = `调查时间: ${record.timestamp}`;

        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(timeDiv);
        resultsContainer.appendChild(messageDiv);
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
    let stressLabel, emotion, textColor, emotionKey;
    if (stressLevel <= 1) {
        stressLabel = '平静';
        emotion = '😐 平静';
        textColor = '#27ae60';
        emotionKey = 'calm';
    } else if (stressLevel <= 2) {
        stressLabel = '紧张';
        emotion = '😟 紧张';
        textColor = '#f39c12';
        emotionKey = 'tense';
    } else if (stressLevel <= 3) {
        stressLabel = '焦虑';
        emotion = '😰 焦虑';
        textColor = '#e67e22';
        emotionKey = 'anxious';
    } else if (stressLevel <= 4) {
        stressLabel = '恐慌';
        emotion = '😨 恐慌';
        textColor = '#e74c3c';
        emotionKey = 'panic';
    } else {
        stressLabel = '崩溃';
        emotion = '😱 崩溃';
        textColor = '#c0392b';
        emotionKey = 'breakdown';
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

    // 同步右侧面板头像情绪样式（如果存在）
    const rightImage = document.getElementById('current-suspect-image');
    if (rightImage) {
        const classesToRemove = ['emotion-calm','emotion-tense','emotion-anxious','emotion-panic','emotion-breakdown'];
        rightImage.classList.remove(...classesToRemove);
        rightImage.classList.add(`emotion-${emotionKey}`);
    }
}

// 在聊天界面中开始审问
function startChatInterrogation(suspectId) {
    console.log('🎯 startChatInterrogation called with suspectId:', suspectId);
    console.log('📋 Current game state:', {
        currentSuspect: game.currentSuspect,
        evidenceCount: game.evidence.length,
        conversations: Object.keys(game.conversations)
    });

    game.currentSuspect = suspectId;
    const suspect = suspects[suspectId];
    console.log('👤 Set currentSuspect to:', game.currentSuspect);
    console.log('🧑 Suspect info:', suspect);

    // 更新聊天头部信息
    const chatName = document.getElementById('current-chat-name');
    const chatAvatar = document.getElementById('current-chat-avatar');
    
    if (chatName) chatName.textContent = `审问 ${suspect.name}`;
    
    if (chatAvatar && suspect.image) {
        chatAvatar.src = suspect.image;
        chatAvatar.alt = suspect.name;
        chatAvatar.style.display = 'block';
    }

    // 更新嫌疑人卡片状态
    document.querySelectorAll('.suspect-chat-card').forEach(card => {
        card.classList.remove('active');
    });
    
    const currentCard = document.querySelector(`[data-suspect="${suspectId}"]`);
    if (currentCard) {
        currentCard.classList.add('active');
        
        // 更新聊天预览
        const preview = currentCard.querySelector('.chat-preview');
        if (preview) {
            preview.textContent = '正在审问中...';
        }
    }

    // 清空欢迎消息，准备聊天
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';

    // 启用输入框
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-message');
    
    if (chatInput) {
        chatInput.disabled = false;
        chatInput.placeholder = `向 ${suspect.name} 提问...`;
    }
    if (sendButton) {
        sendButton.disabled = false;
    }

    // 初始化对话
    if (!game.conversations[suspectId]) {
        game.conversations[suspectId] = new AIConversation(suspectId);
    }

    const conversation = game.conversations[suspectId];

    // 更新证据显示
    game.updateEvidenceDisplay();

    // 更新嫌疑人状态显示
    updateChatSuspectStatus(conversation);

    // 添加系统消息
    addChatMessage('system', `你开始审问 ${suspect.name}`);
    
    // 同步语音状态
    setTimeout(() => {
        console.log('🎯 审问开始，当前语音状态:', game.voiceEnabled);
        syncAllVoiceCheckboxes();
        console.log('✅ 审问开始时语音状态已同步完成');
    }, 50);

    // 恢复之前的对话记录
    if (conversation.conversationHistory.length > 0) {
        conversation.conversationHistory.forEach(turn => {
            if (turn.isInitial) {
                addChatMessage('npc', turn.npc);
            } else {
                if (turn.evidence) {
                    addChatMessage('system', `你出示了证据：${turn.evidence.name}`);
                }
                addChatMessage('player', turn.player);
                addChatMessage('npc', turn.npc);
            }
        });
    } else {
        // 如果是第一次审问，立即显示预设发言
        const initialStatement = conversation.getInitialStatement();
        if (initialStatement) {
            addChatMessage('npc', initialStatement);
        }
    }
}

// 审问功能 (保留旧的功能用于向后兼容)
function startInterrogation(suspectId) {
    game.currentSuspect = suspectId;
    const suspect = suspects[suspectId];

    document.getElementById('current-suspect-name').textContent = `审问 ${suspect.name}`;
    document.getElementById('chat-messages').innerHTML = '';

    // 设置角色图片
    const suspectImage = document.getElementById('current-suspect-image');
    if (suspect.image) {
        suspectImage.src = suspect.image;
        suspectImage.alt = suspect.name;
        suspectImage.style.display = 'block';
    } else {
        suspectImage.style.display = 'none';
    }

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

// 更新聊天界面中的嫌疑人状态显示
function updateChatSuspectStatus(conversation) {
    const stressLevel = conversation.stressLevel;
    const stressPercentage = Math.min((stressLevel / 5) * 100, 100);

    // 更新压力条 - 使用聊天界面专用的ID
    const stressFill = document.getElementById('chat-stress-fill');
    const stressText = document.getElementById('chat-stress-text');
    const emotionIndicator = document.getElementById('chat-emotion-indicator');

    if (stressFill) {
        stressFill.style.width = `${stressPercentage}%`;
    }

    // 根据压力等级显示不同的状态
    let stressLabel, emotion, textColor, emotionKey;
    if (stressLevel <= 1) {
        stressLabel = '平静';
        emotion = '😐 平静';
        textColor = '#27ae60';
        emotionKey = 'calm';
    } else if (stressLevel <= 2) {
        stressLabel = '紧张';
        emotion = '😟 紧张';
        textColor = '#f39c12';
        emotionKey = 'tense';
    } else if (stressLevel <= 3) {
        stressLabel = '焦虑';
        emotion = '😰 焦虑';
        textColor = '#e67e22';
        emotionKey = 'anxious';
    } else if (stressLevel <= 4) {
        stressLabel = '恐慌';
        emotion = '😨 恐慌';
        textColor = '#e74c3c';
        emotionKey = 'panic';
    } else {
        stressLabel = '崩溃';
        emotion = '😱 崩溃';
        textColor = '#c0392b';
        emotionKey = 'breakdown';
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

    // 更新左侧列表当前卡片的情绪样式
    const currentCard = document.querySelector(`.suspect-chat-card[data-suspect="${game.currentSuspect}"] .suspect-image`);
    if (currentCard) {
        const classesToRemove = ['emotion-calm','emotion-tense','emotion-anxious','emotion-panic','emotion-breakdown'];
        currentCard.classList.remove(...classesToRemove);
        currentCard.classList.add(`emotion-${emotionKey}`);
    }
}

// 在聊天界面中添加消息
function addChatMessage(type, content) {
    console.log('💬 addChatMessage called:', { type, content });
    const messagesContainer = document.getElementById('chat-messages');
    console.log('📦 Chat messages container found:', !!messagesContainer);
    if (!messagesContainer) {
        console.log('❌ Chat messages container not found!');
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    console.log('✅ Chat message added successfully');
}

function addMessage(type, content) {
    console.log('💬 addMessage called:', { type, content });
    const messagesContainer = document.getElementById('chat-messages');
    console.log('📦 Messages container found:', !!messagesContainer);
    if (!messagesContainer) {
        console.log('❌ Messages container not found!');
        return;
    }
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    console.log('✅ Message added successfully');
}

async function sendMessage() {
    console.log('💬 sendMessage called');
    const input = document.getElementById('chat-input');
    const message = input.value.trim();
    console.log('📝 Input message:', message);

    if (!message || !game.currentSuspect) {
        console.log('❌ Empty message or no current suspect:', { message: !!message, currentSuspect: !!game.currentSuspect });
        return;
    }

    console.log('✅ Proceeding with message send');

    input.value = '';

    // 根据当前界面选择合适的添加消息函数
    const chatEvidenceElement = document.querySelector('#chat-available-evidence');
    const isInChatInterface = !!chatEvidenceElement;
    console.log('📱 sendMessage interface detection:', {
        chatEvidenceExists: !!chatEvidenceElement,
        chatEvidenceContent: chatEvidenceElement ? chatEvidenceElement.innerHTML : 'N/A',
        currentSuspect: game.currentSuspect,
        evidenceCount: game.evidence.length
    });
    const addMessageFunc = isInChatInterface ? addChatMessage : addMessage;
    
    addMessageFunc('player', message);

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
        addMessageFunc('npc', response);

        // 更新嫌疑人状态
        if (isInChatInterface) {
            updateChatSuspectStatus(conversation);
        } else {
            updateSuspectStatus(conversation);
        }

        // 更新聊天预览（只在聊天界面中）
        if (isInChatInterface) {
            const currentCard = document.querySelector(`[data-suspect="${game.currentSuspect}"]`);
            if (currentCard) {
                const preview = currentCard.querySelector('.chat-preview');
                if (preview) {
                    // 显示最后的回复片段
                    const shortResponse = response.length > 20 ? response.substring(0, 20) + '...' : response;
                    preview.textContent = shortResponse;
                }
            }
        }

        // 如果启用了语音，播放AI回复
        console.log('检查语音播放条件:');
        console.log('- 语音启用状态:', game.voiceEnabled);
        console.log('- API密钥存在:', !!AI_CONFIG.API_KEY);
        console.log('- API密钥有效:', AI_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE');
        console.log('- 实际的game对象:', game);
        console.log('- 实际的voiceEnabled值:', game.voiceEnabled, typeof game.voiceEnabled);
        
        if (game.voiceEnabled && AI_CONFIG.API_KEY && AI_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE') {
            console.log('播放语音回复...');
            await game.voiceManager.textToSpeech(response, game.currentSuspect);
        } else {
            let reason = '';
            if (!game.voiceEnabled) {
                reason = '语音功能未启用 - 请勾选"启用语音回复"';
            } else if (!AI_CONFIG.API_KEY) {
                reason = '缺少API密钥';
            } else if (AI_CONFIG.API_KEY === 'YOUR_API_KEY_HERE') {
                reason = 'API密钥无效';
            }
            console.log('语音未播放:', reason);
        }
    } catch (error) {
        thinkingMsg.textContent = '对话出现错误，请重试。';
    }
}

function updateAPIKey() {
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKey = apiKeyInput.value.trim();



    if (apiKey) {
        AI_CONFIG.API_KEY = apiKey;

    } else {

    }
}

// 出示证据功能
function presentEvidence(evidenceId) {
    console.log('🔍 presentEvidence called with evidenceId:', evidenceId);
    const evidence = game.evidence.find(e => e.id === evidenceId);
    console.log('📋 Found evidence:', evidence);
    console.log('👤 Current suspect:', game.currentSuspect);

    if (!evidence) {
        console.log('❌ Evidence not found for id:', evidenceId);
        return;
    }

    if (!game.currentSuspect) {
        console.log('❌ No current suspect set');
        return;
    }

    console.log('✅ Proceeding with evidence presentation');

    // 根据当前界面选择合适的添加消息函数
    const chatEvidenceElement = document.querySelector('#chat-available-evidence');
    const isInChatInterface = !!chatEvidenceElement;
    console.log('🏠 presentEvidence interface detection:', {
        chatAvailableEvidenceExists: !!chatEvidenceElement,
        chatAvailableEvidenceContent: chatEvidenceElement ? chatEvidenceElement.innerHTML : 'N/A',
        suspectsChatContainer: !!document.querySelector('.suspects-chat-container'),
        currentPanel: document.querySelector('.panel.active')?.id,
        isInChatInterface: isInChatInterface
    });

    const addMessageFunc = isInChatInterface ? addChatMessage : addMessage;

    addMessageFunc('system', `你出示了证据：${evidence.name}`);

    // 显示AI思考中
    const thinkingMsg = document.createElement('div');
    thinkingMsg.className = 'message npc';
    thinkingMsg.textContent = '思考中...';

    // 根据当前界面选择正确的消息容器
    const messagesContainer = document.getElementById('chat-messages');

    if (messagesContainer) {
        messagesContainer.appendChild(thinkingMsg);
    }

    setTimeout(async () => {
        try {
            const conversation = game.conversations[game.currentSuspect];
            const response = await conversation.generateResponse(`[出示证据: ${evidence.name}]`, evidence);

            thinkingMsg.remove();
            addMessageFunc('npc', response);

            // 更新嫌疑人状态
            if (isInChatInterface) {
                updateChatSuspectStatus(conversation);
                
                // 更新聊天预览
                const currentCard = document.querySelector(`[data-suspect="${game.currentSuspect}"]`);
                if (currentCard) {
                    const preview = currentCard.querySelector('.chat-preview');
                    if (preview) {
                        const shortResponse = response.length > 20 ? response.substring(0, 20) + '...' : response;
                        preview.textContent = shortResponse;
                    }
                }
            } else {
                updateSuspectStatus(conversation);
            }

            // 如果启用了语音，播放AI回复
            if (game.voiceEnabled && AI_CONFIG.API_KEY && AI_CONFIG.API_KEY !== 'YOUR_API_KEY_HERE') {
                await game.voiceManager.textToSpeech(response, game.currentSuspect);
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

    const resultsContainer = document.querySelector('.scene-chat-messages');
    if (!resultsContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'scene-chat-message investigation';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = `调查时间: ${new Date().toLocaleTimeString()}`;

    let investigationRecord = {
        command: clueKey,
        timestamp: timeDiv.textContent.replace('调查时间: ', '')
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
            contentDiv.innerHTML = `<strong>调查结果：</strong>${randomMessage}`;
            investigationRecord.result = randomMessage;
            investigationRecord.isRepeat = true;
        } else {
            // 首次调查
            contentDiv.innerHTML = `<strong>调查结果：</strong>${foundClue.result}`;
            investigationRecord.result = foundClue.result;

            if (foundClue.evidence) {
                game.addEvidence(foundClue.evidence);
                contentDiv.innerHTML += `<br><strong>发现证据：</strong>${foundClue.evidence.name}`;
                investigationRecord.evidence = foundClue.evidence.name;
            }

            // 标记热点为已调查
            if (hotspot) {
                hotspot.classList.add('investigated');
            }
        }
    } else {
        const result = `你调查了这个区域，但没有发现什么特别的线索。`;
        contentDiv.innerHTML = `<strong>调查结果：</strong>${result}`;
        investigationRecord.result = result;
    }

    // 构建消息元素
    messageDiv.appendChild(contentDiv);
    messageDiv.appendChild(timeDiv);

    // 保存调查记录
    game.sceneInvestigations.push(investigationRecord);
    game.saveGameState();

    resultsContainer.appendChild(messageDiv);
    resultsContainer.scrollTop = resultsContainer.scrollHeight;

    // 添加调查动画效果
    messageDiv.style.opacity = '0';
    messageDiv.style.transform = 'translateY(20px)';
    setTimeout(() => {
        messageDiv.style.transition = 'all 0.5s ease';
        messageDiv.style.opacity = '1';
        messageDiv.style.transform = 'translateY(0)';
    }, 100);
}

// 切换热点显示
function toggleHotspots() {
    const hotspots = document.querySelectorAll('.hotspot');
    const isVisible = hotspots.length > 0 && hotspots[0].classList.contains('visible');
    const button = document.getElementById('toggle-hotspots');

    hotspots.forEach(hotspot => {
        if (isVisible) {
            hotspot.classList.remove('visible');
        } else {
            hotspot.classList.add('visible');
        }
    });

    // 切换眼睛图标状态
    if (button) {
        if (isVisible) {
            // 从显示提示切换到隐藏提示
            button.classList.remove('show-closed');
            button.classList.add('show-closed');
            button.title = '隐藏提示';
        } else {
            // 从隐藏提示切换到显示提示
            button.classList.remove('show-closed');
            button.title = '显示提示';
        }
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
        
        // 如果图片已经加载完成，立即调整位置
        if (crimeSceneImage.complete) {
            adjustHotspotPositions();
        }

        // 首次加载时显示热点提示3秒
        setTimeout(() => {
            adjustHotspotPositions(); // 确保在显示提示前位置正确
            const hotspots = document.querySelectorAll('.hotspot');
            hotspots.forEach(hotspot => hotspot.classList.add('visible'));

            setTimeout(() => {
                hotspots.forEach(hotspot => hotspot.classList.remove('visible'));
            }, 3000);
        }, 1000);
    }

    // 窗口大小改变时重新调整
    window.addEventListener('resize', () => {
        setTimeout(adjustHotspotPositions, 100); // 延迟一点确保布局完成
    });
}

// 调整热点位置以适应实际图片尺寸
function adjustHotspotPositions() {
    const image = document.getElementById('crime-scene-image');
    const container = document.querySelector('.scene-image-container');
    
    if (!image || !container) return;
    
    // 等待图片加载完成
    if (!image.complete) {
        image.addEventListener('load', adjustHotspotPositions);
        return;
    }
    
    // 获取容器和图片的实际尺寸
    const containerRect = container.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    
    // 计算图片在容器中的实际位置和尺寸
    const scaleX = imageRect.width / containerRect.width;
    const scaleY = imageRect.height / containerRect.height;
    const offsetX = (containerRect.width - imageRect.width) / 2;
    const offsetY = (containerRect.height - imageRect.height) / 2;
    
    // 热点原始位置数据（相对于图片的百分比位置）
    const hotspotData = {
        'hotspot-body': { x: 48, y: 58, width: 8, height: 12 },
        'hotspot-sword': { x: 45, y: 85, width: 6, height: 8 },
        'hotspot-trees': { x: 80, y: 34, width: 8, height: 15 },
        'hotspot-ground': { x: 75, y: 90, width: 10, height: 6 },
        'hotspot-flowers': { x: 12, y: 75, width: 12, height: 12 },
        'hotspot-rope': { x: 53, y: 68, width: 6, height: 8 }
    };
    
    // 更新每个热点的位置
    Object.entries(hotspotData).forEach(([id, data]) => {
        const hotspot = document.getElementById(id);
        if (!hotspot) return;
        
		// 计算相对于容器的实际位置（使用中心点定位）
		const width = Math.max((data.width / 100) * imageRect.width, 40);
		const height = Math.max((data.height / 100) * imageRect.height, 40);
		const centerX = offsetX + (data.x / 100) * imageRect.width;
		const centerY = offsetY + (data.y / 100) * imageRect.height;
		const left = centerX - width / 2;
		const top = centerY - height / 2;
        
        // 应用位置和尺寸
        hotspot.style.left = `${left}px`;
        hotspot.style.top = `${top}px`;
        hotspot.style.width = `${width}px`;
        hotspot.style.height = `${height}px`;
    });
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
    // 评判逻辑
    const correctKiller = killer === 'onitake';
    
    // 手法关键词 - 更宽松的匹配
    const methodKeywords = [
        '失手', '混乱', '推搡', '意外', '不小心', '失控', 
        '争斗', '扭打', '慌乱', '酒后', '喝酒', '酒精',
        '断剑', '断刀', '质量差', '劣质', '破刀'
    ];
    const methodContainsKey = methodKeywords.some(keyword => method.includes(keyword));
    
    // 动机关键词 - 更宽松的匹配  
    const motiveKeywords = [
        '面子', '名誉', '形象', '尊严', '声誉', '威望',
        '吹牛', '自负', '好面子', '不服', '逞强',
        '维护', '保持', '掩饰'
    ];
    const motiveContainsKey = motiveKeywords.some(keyword => motive.includes(keyword));
    
    // 只要凶手正确，并且手法或动机有一个正确就算通过
    return correctKiller && (methodContainsKey || motiveContainsKey);
}

function showResult(isCorrect, killer, method, motive) {
    let title, content;
    
    if (isCorrect) {
        title = '🎉 破案成功！';
        content = `
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
        title = '❌ 真相未明';
        content = `
            <h3>很遗憾，你的推理还不够准确。</h3>
            <p><strong>你的推理：</strong></p>
            <p><strong>凶手：</strong>${suspects[killer]?.name || killer}</p>
            <p><strong>手法：</strong>${method}</p>
            <p><strong>动机：</strong>${motive}</p>
            
            <h3>提示：</h3>
            <div style="background: rgba(241, 196, 15, 0.2); padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f1c40f;">
                <h4 style="color: #f39c12; margin-bottom: 15px;">💡 破案关键提示</h4>
                <p><strong>正确凶手：</strong>大盗"鬼武"</p>
                <p><strong>手法关键词：</strong>失手、混乱、推搡、意外、争斗、酒后、断剑等</p>
                <p><strong>动机关键词：</strong>面子、名誉、形象、尊严、好面子、维护等</p>
                <p><strong>核心真相：</strong>鬼武确实杀了武士，但不是光荣的决斗，而是在混乱中失手杀死了跪地求饶的武士。他撒谎是为了维护自己"强大"的形象。</p>
            </div>
            
            <p>仔细想想现场的证据和每个人证词中的矛盾之处。每个人都有自己的秘密和撒谎的理由。</p>
        `;
    }

    // 显示结果弹框而不跳转页面
    showResultModal(isCorrect, title, content);
    game.gameCompleted = true;
}

// 显示结果弹框
function showResultModal(isCorrect, title, content) {
    // 创建结果弹框
    const modal = document.createElement('div');
    modal.className = 'result-modal';
    modal.innerHTML = `
        <div class="result-overlay"></div>
        <div class="result-popup">
            <div class="result-header">
                <h2 style="color: ${isCorrect ? '#27ae60' : '#e74c3c'}">${title}</h2>
                <button class="close-result-btn">✕</button>
            </div>
            <div class="result-body">
                ${content}
            </div>
            <div class="result-footer">
                <button id="restart-game-modal" class="primary-btn">重新开始</button>
                <button class="secondary-btn close-result-btn">继续调查</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 添加关闭事件
    modal.querySelectorAll('.close-result-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
    });
    
    // 添加重新开始事件
    document.getElementById('restart-game-modal').addEventListener('click', () => {
        if (confirm('确定要重新开始游戏吗？这将清除所有进度。')) {
            game.clearGameState();
            location.reload();
        }
    });
    
    // 点击遮罩关闭
    modal.querySelector('.result-overlay').addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// 全局语音同步函数
function syncAllVoiceCheckboxes() {
    const checkboxes = ['chat-voice-enabled', 'interrogation-voice-enabled'];
    let syncedCount = 0;
    
    checkboxes.forEach(id => {
        const checkbox = document.getElementById(id);
        if (checkbox) {
            // 只在状态不一致时才同步，避免触发change事件
            if (checkbox.checked !== game.voiceEnabled) {
                checkbox.checked = game.voiceEnabled;
                console.log(`🔄 同步语音复选框 ${id}: ${game.voiceEnabled}`);
            }
            syncedCount++;
        } else {
            console.log(`❌ 未找到语音复选框 ${id}`);
        }
    });
    
    console.log(`🎯 语音复选框同步完成 (${syncedCount}/${checkboxes.length}), 当前状态:`, game.voiceEnabled);
}

// 事件监听器
document.addEventListener('DOMContentLoaded', async function () {
    // 总是先显示封面页，让用户手动点击"进入游戏"
    showScreen('cover');
    
    // 根据是否看过封面调整按钮文本
    const enterGameBtn = document.getElementById('enter-game');
    if (game.hasSeenCover && enterGameBtn) {
        enterGameBtn.textContent = '继续游戏';
    }
    
    // 初始化封面页
    initializeCover();

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
    document.getElementById('nav-accusation').addEventListener('click', () => showPanel('accusation-panel'));

    // 嫌疑人聊天卡片点击事件
    document.querySelectorAll('.suspect-chat-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const suspectId = card.dataset.suspect;
            console.log('🖱️ Suspect card clicked:', {
                suspectId,
                card: e.target,
                cardClasses: e.target.classList,
                cardDataset: e.target.dataset
            });
            startChatInterrogation(suspectId);
        });
    });

    // 审问按钮（保留用于向后兼容）
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
        showPanel('scene-panel'); // 返回到现场调查面板
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



    // 设置语音控件 - 简化版
    // 语音控制现在直接在HTML的onclick中处理

    // 在游戏加载完成后同步语音状态 - 延迟确保DOM完全加载
    setTimeout(() => {
        console.log('🎮 游戏加载完成，当前语音状态:', game.voiceEnabled);
        syncAllVoiceCheckboxes();
        console.log('🔄 延迟同步语音状态完成:', game.voiceEnabled);
    }, 100);
    
    // 额外的同步检查 - 确保状态正确
    setTimeout(() => {
        console.log('🔍 二次检查语音状态:', game.voiceEnabled);
        syncAllVoiceCheckboxes();
    }, 500);

    // 停止音频按钮
    document.getElementById('stop-audio').addEventListener('click', () => {

        game.voiceManager.stopAudio();
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
    console.log('是否已看过封面:', game.hasSeenCover);

    // 检查DOM元素
    console.log('🔍 Checking DOM elements:');
    console.log('- chat-messages:', !!document.getElementById('chat-messages'));
    const chatEvidenceElement = document.getElementById('chat-available-evidence');
    console.log('- chat-available-evidence:', !!chatEvidenceElement);
    console.log('- chat-available-evidence content:', chatEvidenceElement ? chatEvidenceElement.innerHTML : 'N/A');
    console.log('- available-evidence:', !!document.getElementById('available-evidence'));
    console.log('- suspects-chat-container:', !!document.querySelector('.suspects-chat-container'));
    console.log('- active panel:', document.querySelector('.panel.active')?.id);
    console.log('- evidence buttons count:', document.querySelectorAll('.evidence-btn').length);
    console.log('- evidence buttons details:', Array.from(document.querySelectorAll('.evidence-btn')).map(btn => ({
        id: btn.dataset.evidence,
        text: btn.textContent,
        classes: btn.classList.toString()
    })));

    // 添加测试按钮来手动添加证据（用于调试）
    const testEvidenceBtn = document.createElement('button');
    testEvidenceBtn.textContent = '添加测试证据';
    testEvidenceBtn.style.cssText = 'position: fixed; top: 10px; right: 10px; z-index: 9999; padding: 10px; background: red; color: white;';
    testEvidenceBtn.addEventListener('click', () => {
        console.log('🧪 Adding test evidence...');
        const testEvidence = {
            id: 'test_evidence',
            name: '测试证据',
            description: '这是一个测试证据',
            image: null
        };
        game.addEvidence(testEvidence);
        console.log('✅ Test evidence added');
    });
    document.body.appendChild(testEvidenceBtn);
});