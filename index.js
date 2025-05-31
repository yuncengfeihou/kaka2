// public/extensions/third-party/kaka2/index.js

import {
    extension_settings,
    getContext, // 如果需要使用 context 对象，则导入
    renderExtensionTemplateAsync,
    // loadExtensionSettings // 这个函数通常由 ST 核心调用，插件一般不需要主动导入和调用
} from '../../../extensions.js';

// 从 script.js 导入
import {
    saveSettingsDebounced,
    eventSource,
    event_types, // 如果需要监听事件，则导入
    // 其他可能需要的函数，如 messageFormatting, addOneMessage 等
} from '../../../../script.js';

// 如果你的插件需要弹窗功能，从 popup.js 导入
import {
    Popup,
    POPUP_TYPE,
    callGenericPopup,
    POPUP_RESULT,
} from '../../../popup.js';

// 如果需要 UUID 或时间戳处理等工具函数，从 utils.js 导入
import {
    uuidv4,
    timestampToMoment,
} from '../../../utils.js';

// 插件的命名空间，与 manifest.json 中的文件夹名称一致
const PLUGIN_ID = 'kaka2';
const PLUGIN_NAME = 'AKA截图2.0'; // 更新插件名以区分

// 插件的默认设置
const defaultSettings = {
    screenshotDelay: 10,       // 可以设置更低值，比如 0-20
    autoInstallButtons: true,
    altButtonLocation: true,
    screenshotScale: 2.0,      // 提高到 2.0 以提供清晰度
    useForeignObjectRendering: true, // html-to-image 支持
    debugOverlay: true,        // 是否显示进度遮罩层
    // 已移除不再支持的设置
};

// 全局配置对象，将从设置中加载
const config = {
    buttonClass: 'st-screenshot-button',
    chatScrollContainerSelector: '#chat',
    chatContentSelector: '#chat',
    messageSelector: '.mes',
    lastMessageSelector: '.mes.last_mes',
    messageTextSelector: '.mes_block .mes_text',
    messageHeaderSelector: '.mes_block .ch_name',
    htmlToImageOptions: { // 重命名
        // 选项会从 settings 加载
    }
};

// 确保插件设置已加载并与默认值合并
function getPluginSettings() {
    extension_settings[PLUGIN_ID] = extension_settings[PLUGIN_ID] || {};
    Object.assign(extension_settings[PLUGIN_ID], { ...defaultSettings, ...extension_settings[PLUGIN_ID] });
    return extension_settings[PLUGIN_ID];
}

// 加载并应用配置
function loadConfig() {
    const settings = getPluginSettings();

    // 基本配置
    config.screenshotDelay = parseInt(settings.screenshotDelay, 10) || 0;

    // 将所有 html-to-image 相关设置正确地应用到 htmlToImageOptions
    const loadedScale = parseFloat(settings.screenshotScale);
    if (!isNaN(loadedScale) && loadedScale > 0) {
        config.htmlToImageOptions.scale = loadedScale;
    } else {
        config.htmlToImageOptions.scale = defaultSettings.screenshotScale;
    }

    config.htmlToImageOptions.useForeignObjectRendering = settings.useForeignObjectRendering;
    
    console.log(`${PLUGIN_NAME}: 配置已加载并应用:`, config);

    config.autoInstallButtons = settings.autoInstallButtons;
}

// === 动态加载脚本的辅助函数 ===
async function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => {
            console.log(`[${PLUGIN_NAME}] 脚本加载成功: ${src}`);
            resolve();
        };
        script.onerror = (error) => {
            console.error(`[${PLUGIN_NAME}] 脚本加载失败: ${src}`, error);
            reject(new Error(`Failed to load script: ${src}`));
        };
        document.head.appendChild(script);
    });
}

// SillyTavern 插件入口点
jQuery(async () => {
    console.log(`${PLUGIN_NAME}: 插件初始化中...`);

    // === 动态加载 html-to-image.min.js ===
    try {
        await loadScript(`scripts/extensions/third-party/${PLUGIN_ID}/html-to-image.min.js`);
        if (typeof htmlToImage === 'undefined') {
            throw new Error('htmlToImage global object not found after loading script.');
        }
    } catch (error) {
        console.error(`${PLUGIN_NAME}: 无法加载 html-to-image.min.js。插件功能将受限。`, error);
        return;
    }

    // 1. 加载配置（从 extension_settings）
    loadConfig();

    // 2. 注册设置面板
    let settingsHtml;
    try {
        settingsHtml = await renderExtensionTemplateAsync(`third-party/${PLUGIN_ID}`, 'settings');
        console.log(`${PLUGIN_NAME}: 成功加载设置面板模板`);
    } catch (error) {
        console.error(`${PLUGIN_NAME}: 无法加载设置面板模板:`, error);
        settingsHtml = `
        <div id="scane2_settings">
          <h2>${PLUGIN_NAME}</h2>

          <div class="option-group">
            <h3>截图操作</h3>
            <button id="st_h2c_captureLastMsgBtn" class="menu_button">截取最后一条消息</button>
          </div>

          <hr>

          <div class="option-group">
            <h3>扩展设置</h3>
            <div class="option">
              <label for="st_h2c_screenshotDelay">截图前延迟 (ms):</label>
              <input type="number" id="st_h2c_screenshotDelay" min="0" max="2000" step="50" value="${defaultSettings.screenshotDelay}">
            </div>
            <div class="option">
              <label for="st_h2c_screenshotScale">渲染比例 (Scale):</label>
              <input type="number" id="st_h2c_screenshotScale" min="0.5" max="4.0" step="0.1" value="${defaultSettings.screenshotScale}">
            </div>
            <div class="option">
                <input type="checkbox" id="st_h2c_useForeignObjectRendering" ${defaultSettings.useForeignObjectRendering ? 'checked' : ''}>
                <label for="st_h2c_useForeignObjectRendering">尝试SVG对象渲染 (某些浏览器/内容可能更快)</label>
            </div>
            
            <!-- 以下设置从UI中移除，但在代码中保留功能 -->
            <input type="hidden" id="st_h2c_autoInstallButtons" ${defaultSettings.autoInstallButtons ? 'checked' : ''}>
            <input type="hidden" id="st_h2c_altButtonLocation" ${defaultSettings.altButtonLocation ? 'checked' : ''}>
            <input type="hidden" id="st_h2c_debugOverlay" ${defaultSettings.debugOverlay ? 'checked' : ''}>

            <button id="st_h2c_saveSettingsBtn" class="menu_button">保存设置</button>
            <div class="status-area" id="st_h2c_saveStatus" style="display:none;"></div>
          </div>
        </div>
        `;
    }

    $('#extensions_settings_content').append(settingsHtml);

    // 3. 绑定设置界面元素和事件
    const settingsForm = $('#extensions_settings_content');

    const screenshotDelayEl = settingsForm.find('#st_h2c_screenshotDelay');
    const screenshotScaleEl = settingsForm.find('#st_h2c_screenshotScale');
    const useForeignObjectRenderingEl = settingsForm.find('#st_h2c_useForeignObjectRendering');
    const autoInstallButtonsEl = settingsForm.find('#st_h2c_autoInstallButtons');
    const altButtonLocationEl = settingsForm.find('#st_h2c_altButtonLocation');
    const saveSettingsBtn = settingsForm.find('#st_h2c_saveSettingsBtn');
    const saveStatusEl = settingsForm.find('#st_h2c_saveStatus');
    const captureLastMsgBtn = settingsForm.find('#st_h2c_captureLastMsgBtn');
    const debugOverlayEl = settingsForm.find('#st_h2c_debugOverlay');

    function updateSettingsUI() {
        const settings = getPluginSettings();
        screenshotDelayEl.val(settings.screenshotDelay);
        screenshotScaleEl.val(settings.screenshotScale);
        useForeignObjectRenderingEl.prop('checked', settings.useForeignObjectRendering);
        autoInstallButtonsEl.prop('checked', settings.autoInstallButtons);
        altButtonLocationEl.prop('checked', settings.altButtonLocation !== undefined ? settings.altButtonLocation : true);
        
        if (debugOverlayEl) debugOverlayEl.prop('checked', settings.debugOverlay);
    }

    saveSettingsBtn.on('click', () => {
        const settings = getPluginSettings();

        settings.screenshotDelay = parseInt(screenshotDelayEl.val(), 10) || defaultSettings.screenshotDelay;
        settings.screenshotScale = parseFloat(screenshotScaleEl.val()) || defaultSettings.screenshotScale;
        settings.useForeignObjectRendering = useForeignObjectRenderingEl.prop('checked');
        settings.autoInstallButtons = autoInstallButtonsEl.prop('checked');
        settings.altButtonLocation = altButtonLocationEl.prop('checked');
        settings.debugOverlay = debugOverlayEl.prop('checked');

        saveSettingsDebounced();
        saveStatusEl.text("设置已保存!").css('color', '#4cb944').show();
        setTimeout(() => saveStatusEl.hide(), 1000);

        loadConfig();
        if (config.autoInstallButtons) {
            installScreenshotButtons();
        } else {
            document.querySelectorAll(`.${config.buttonClass}`).forEach(btn => btn.remove());
        }
		$('#extensions_settings').hide();     // SillyTavern 本体的设置侧栏
    });

    captureLastMsgBtn.on('click', async () => {
        const options = { target: 'last', includeHeader: true };
        try {
            const dataUrl = await captureMessageWithOptions(options);
            if (dataUrl) {
                downloadImage(dataUrl, null, options.target);
            } else {
                throw new Error('未能生成截图 (html-to-image)');
            }
        } catch (error) {
            console.error('从设置面板截图失败 (html-to-image):', error.stack || error);
            alert(`截图失败: ${error.message || '未知错误'}`);
        }
    });

    updateSettingsUI();

    if (config.autoInstallButtons) {
        installScreenshotButtons();
    } else {
        console.log(`${PLUGIN_NAME}: 自动安装截图按钮已禁用.`);
    }

    console.log(`${PLUGIN_NAME}: 插件初始化完成.`);

    // 创建并添加扩展菜单按钮
    function addExtensionMenuButton() {
        if (document.querySelector(`#extensionsMenu .fa-camera[data-plugin-id="${PLUGIN_ID}"]`)) {
            return;
        }
        const menuButton = document.createElement('div');
        menuButton.classList.add('extensionsMenuExtension');
    
        // 1) 图标
        const icon = document.createElement('i');
        icon.classList.add('fa-solid', 'fa-camera');
        menuButton.appendChild(icon);
    
        // 2) 文本标签
        menuButton.appendChild(document.createTextNode('截图设置'));
        menuButton.title = PLUGIN_NAME;
        menuButton.setAttribute('data-plugin-id', PLUGIN_ID);
        menuButton.addEventListener('click', () => {
            const extensionsMenu = document.getElementById('extensionsMenu');
            if (extensionsMenu) extensionsMenu.style.display = 'none';
            showScreenshotPopup();
        });
        const extensionsMenu = document.getElementById('extensionsMenu');
        if (extensionsMenu) {
            extensionsMenu.appendChild(menuButton);
        }
    }

    // 显示截图功能弹窗
    function showScreenshotPopup() {
        const overlay = document.createElement('div');
        overlay.className = 'st-screenshot-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '10000', display: 'flex', justifyContent: 'center', alignItems:'flex-start' });

        const popup = document.createElement('div');
        popup.className = 'st-screenshot-popup';
        const bgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintColor') || '#2a2a2a';
        const boxBorderColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#555';
        Object.assign(popup.style, { 
            backgroundColor: bgColor.trim(), 
            border: `1px solid ${boxBorderColor.trim()}`,
            padding: '20px', 
            borderRadius: '10px', 
            maxWidth: '300px', 
            marginTop: '35vh', 
            width: '100%', 
            overflowY: 'auto'
        });

        const options = [
            { id: 'last_msg', icon: 'fa-camera', text: '截取最后一条消息' },
            { id: 'conversation', icon: 'fa-images', text: '截取整个对话' },
            { id: 'settings', icon: 'fa-gear', text: '调整截图设置' }
        ];
        
        options.forEach(option => {
            const btn = document.createElement('div');
            btn.className = 'st-screenshot-option';
            const btnBgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#3a3a3a';
            const menuHoverColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintStrength') || '#4a4a4a';
            Object.assign(btn.style, { 
                display: 'flex', 
                alignItems: 'center', 
                gap: '10px', 
                padding: '12px', 
                margin: '8px 0', 
                borderRadius: '5px', 
                cursor: 'pointer', 
                backgroundColor: btnBgColor.trim() 
            });
            
            btn.innerHTML = `<i class="fa-solid ${option.icon}" style="font-size: 1.2em;"></i><span>${option.text}</span>`;
            
            btn.addEventListener('mouseover', () => btn.style.backgroundColor = menuHoverColor.trim());
            btn.addEventListener('mouseout', () => btn.style.backgroundColor = btnBgColor.trim());
            
            btn.addEventListener('click', async () => {
                console.log(`[${PLUGIN_NAME}] ${option.id} clicked`);
                document.body.removeChild(overlay);
                
                try {
                    switch(option.id) {
                        case 'last_msg':
                            const dataUrl = await captureMessageWithOptions({ target: 'last', includeHeader: true });
                            if (dataUrl) downloadImage(dataUrl, null, 'last_message');
                            break;
                        case 'conversation':
                            const convDataUrl = await captureMessageWithOptions({ target: 'conversation', includeHeader: true });
                            if (convDataUrl) downloadImage(convDataUrl, null, 'conversation');
                            break;
                        case 'settings':
                            showSettingsPopup();
                            break;
                    }
                } catch (error) {
                    console.error(`[${PLUGIN_NAME}] 操作失败:`, error);
                    alert(`操作失败 (html-to-image): ${error.message || '未知错误'}`);
                }
            });
            popup.appendChild(btn);
        });
        
        overlay.appendChild(popup);
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
    }

    function waitForExtensionsMenu() {
        if (document.getElementById('extensionsMenu')) {
            addExtensionMenuButton();
            return;
        }
        const observer = new MutationObserver((mutations, obs) => {
            if (document.getElementById('extensionsMenu')) {
                addExtensionMenuButton();
                obs.disconnect();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }
    waitForExtensionsMenu();
});


function prepareSingleElementForCapture(originalElement) {
  // 直接返回完整克隆，不删除任何子节点
  return originalElement.cloneNode(true);
}

// 核心截图函数：使用 html-to-image
async function captureElementWithHtmlToImage(elementToCapture, htiUserOptions = {}) {
    console.log('Preparing to capture element with html-to-image:', elementToCapture);
    
    let overlay = null;
    if (config.debugOverlay) {
        overlay = createOverlay('使用 html-to-image 准备截图...');
        document.body.appendChild(overlay);
    }
    
    const elementsToHide = [
        document.querySelector("#top-settings-holder"),
        document.querySelector("#form_sheld"),
        overlay
    ].filter(el => el);

    let dataUrl = null;

    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px'; // Off-screen
    tempContainer.style.top = '-9999px';
    tempContainer.style.padding = '10px'; // Padding around the content

    const chatContentEl = document.querySelector(config.chatContentSelector);
    let containerWidth = 'auto';
    if (chatContentEl) {
        containerWidth = chatContentEl.clientWidth + 'px';
    } else if (elementToCapture) {
        containerWidth = elementToCapture.offsetWidth + 'px';
    }
    tempContainer.style.width = containerWidth;

    let chatBgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintColor') || '#1e1e1e';
    if (!chatBgColor || chatBgColor.trim() === '') chatBgColor = '#1e1e1e';
    tempContainer.style.backgroundColor = chatBgColor.trim();

    let preparedElement;
    try {
        if (overlay) updateOverlay(overlay, '准备元素结构...', 0.05);
        preparedElement = prepareSingleElementForCapture(elementToCapture);
        if (!preparedElement) throw new Error("Failed to prepare element for capture.");

        tempContainer.appendChild(preparedElement);
        document.body.appendChild(tempContainer);

        if (config.screenshotDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, config.screenshotDelay));
        }

    } catch (e) {
        console.error("Error during element preparation (html-to-image):", e);
        if (overlay && document.body.contains(overlay)) {
             updateOverlay(overlay, `净化错误: ${e.message.substring(0, 60)}...`, 0);
        }
        if (tempContainer.parentElement === document.body) {
           document.body.removeChild(tempContainer);
        }
        throw e;
    }

    try {
        if (overlay) updateOverlay(overlay, '正在渲染 (html-to-image)...', 0.3);
        
        const finalHtmlToImageOptions = { ...config.htmlToImageOptions, ...htiUserOptions };
        
        console.log('html-to-image opts:', finalHtmlToImageOptions);
        
        // 使用 html-to-image 进行渲染
        dataUrl = await htmlToImage.toPng(tempContainer, finalHtmlToImageOptions);
        
        if (overlay) updateOverlay(overlay, '生成图像数据...', 0.8);

    } catch (error) {
        console.error('html-to-image 截图失败:', error.stack || error);
        if (overlay && document.body.contains(overlay)) {
             const errorMsg = error && error.message ? error.message : "未知渲染错误";
             updateOverlay(overlay, `渲染错误 (html-to-image): ${errorMsg.substring(0, 60)}...`, 0);
        }
        throw error;
    } finally {
        if (tempContainer.parentElement === document.body) {
           document.body.removeChild(tempContainer);
        }
        if (overlay && document.body.contains(overlay)) {
            if (!dataUrl) {
                setTimeout(() => { if(document.body.contains(overlay)) document.body.removeChild(overlay); }, 3000);
            } else {
               updateOverlay(overlay, '截图完成!', 1);
               setTimeout(() => { if(document.body.contains(overlay)) document.body.removeChild(overlay); }, 1200);
            }
        }
    }
    if (!dataUrl) throw new Error("html-to-image 未能生成图像数据。");
    console.log("DEBUG: html-to-image capture successful.");
    return dataUrl;
}

// 使用 html-to-image 捕获多条消息
async function captureMultipleMessagesWithHtmlToImage(messagesToCapture, actionHint, htiUserOptions = {}) {
    if (!messagesToCapture || messagesToCapture.length === 0) {
        throw new Error("没有提供消息给 captureMultipleMessagesWithHtmlToImage");
    }
    console.log(`[captureMultipleMessagesWithHtmlToImage] Capturing ${messagesToCapture.length} messages. Hint: ${actionHint}`);

    const overlay = createOverlay(`组合 ${messagesToCapture.length} 条消息 (html-to-image)...`);
    document.body.appendChild(overlay);

    let dataUrl = null;
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.top = '-9999px';
    tempContainer.style.padding = '10px';

    const chatContentEl = document.querySelector(config.chatContentSelector);
    let containerWidth = 'auto';
    if (chatContentEl) {
        containerWidth = chatContentEl.clientWidth + 'px';
    } else if (messagesToCapture.length > 0 && messagesToCapture[0].offsetWidth > 0) {
        containerWidth = messagesToCapture[0].offsetWidth + 'px';
    } else {
        containerWidth = '800px'; 
        console.warn("Could not determine container width for multi-message capture, using fallback.");
    }
    tempContainer.style.width = containerWidth;

    let chatBgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintColor') || '#1e1e1e';
    if(chatContentEl) {
        const chatStyle = window.getComputedStyle(chatContentEl);
        if (chatStyle.backgroundColor && chatStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' && chatStyle.backgroundColor !== 'transparent') {
            chatBgColor = chatStyle.backgroundColor;
        } else {
             const bodyBgVar = getComputedStyle(document.body).getPropertyValue('--pcb');
             if (bodyBgVar && bodyBgVar.trim() !== '') {
                 chatBgColor = bodyBgVar.trim();
             }
        }
    }
    tempContainer.style.backgroundColor = chatBgColor.trim();

    updateOverlay(overlay, `准备 ${messagesToCapture.length} 条消息 (html-to-image)...`, 0.05);
    messagesToCapture.forEach(msg => {
        try {
            const preparedClone = prepareSingleElementForCapture(msg);
            if (preparedClone) {
                tempContainer.appendChild(preparedClone);
            } else {
                 console.warn("Skipping null prepared clone for message:", msg);
            }
        } catch (e) {
            console.error("Error preparing message for multi-capture (html-to-image):", msg, e);
        }
    });
    document.body.appendChild(tempContainer);
    await new Promise(resolve => setTimeout(resolve, config.screenshotDelay)); // Allow render

    try {
        updateOverlay(overlay, '正在渲染 (html-to-image)…', 0.3);

        const finalHtmlToImageOptions = { ...config.htmlToImageOptions, ...htiUserOptions };
        
        console.log("DEBUG: html-to-image (multiple) options:", finalHtmlToImageOptions);
        dataUrl = await htmlToImage.toPng(tempContainer, finalHtmlToImageOptions);

        updateOverlay(overlay, '生成图像数据...', 0.8);

    } catch (error) {
        console.error('html-to-image 多消息截图失败:', error.stack || error);
         if (overlay && document.body.contains(overlay)) {
             const errorMsg = error && error.message ? error.message : "未知渲染错误";
             updateOverlay(overlay, `多消息渲染错误 (html-to-image): ${errorMsg.substring(0,50)}...`, 0);
        }
        throw error;
    } finally {
        if (tempContainer.parentElement === document.body) {
            document.body.removeChild(tempContainer);
        }
        if (overlay && document.body.contains(overlay)) {
            if (!dataUrl) {
                 setTimeout(() => {if(document.body.contains(overlay)) document.body.removeChild(overlay);}, 3000);
            } else {
                updateOverlay(overlay, '截图完成!', 1);
                setTimeout(() => {if(document.body.contains(overlay)) document.body.removeChild(overlay);}, 1200);
            }
        }
    }
    if (!dataUrl) throw new Error("html-to-image 未能生成多消息图像数据。");
    console.log("DEBUG: html-to-image multiple messages capture successful.");
    return dataUrl;
}


// 路由截图请求，现在调用 html-to-image 函数
async function captureMessageWithOptions(options) {
    const { target, includeHeader } = options;
    console.log('captureMessageWithOptions (html-to-image) called with:', options);

    const chatContentEl = document.querySelector(config.chatContentSelector);
    if (!chatContentEl) {
         const errorMsg = `聊天内容容器 '${config.chatContentSelector}' 未找到!`;
         console.error(`${PLUGIN_NAME}:`, errorMsg);
         throw new Error(errorMsg);
    }

    let elementToRender;
    let messagesForMultiCapture = [];

    switch (target) {
        case 'last':
            elementToRender = chatContentEl.querySelector(config.lastMessageSelector);
            if (!elementToRender) throw new Error('最后一条消息元素未找到');
            break;
        case 'selected':
            elementToRender = chatContentEl.querySelector(`${config.messageSelector}[data-selected="true"]`) || chatContentEl.querySelector(`${config.messageSelector}.selected`);
            if (!elementToRender) throw new Error('没有选中的消息');
            break;
        case 'conversation':
            messagesForMultiCapture = Array.from(chatContentEl.querySelectorAll(config.messageSelector));
            if (messagesForMultiCapture.length === 0) throw new Error("对话中没有消息可捕获。");
            return await captureMultipleMessagesWithHtmlToImage(messagesForMultiCapture, "conversation_all", {}); // Updated call
        default:
            throw new Error('未知的截图目标类型');
    }

    if (!elementToRender && messagesForMultiCapture.length === 0) {
         throw new Error(`目标元素未找到 (for ${target} within ${config.chatContentSelector})`);
    }

    if (elementToRender) {
        let finalElementToCapture = elementToRender;
        if (!includeHeader && target !== 'conversation' && elementToRender.querySelector(config.messageTextSelector)) {
            const textElement = elementToRender.querySelector(config.messageTextSelector);
            if (textElement) {
                finalElementToCapture = textElement;
                console.log('Capturing text element only with html-to-image:', finalElementToCapture);
            } else {
                console.warn("Could not find text element for includeHeader: false, capturing full message.");
            }
        }
        return await captureElementWithHtmlToImage(finalElementToCapture, {}); // Updated call
    }
    throw new Error("captureMessageWithOptions (html-to-image): Unhandled capture scenario.");
}

// 安装截图按钮
function installScreenshotButtons() {
    document.querySelectorAll(`.${config.buttonClass}`).forEach(btn => btn.remove());

    const chatContentEl = document.querySelector(config.chatContentSelector);
    if (chatContentEl) {
        chatContentEl.querySelectorAll(config.messageSelector).forEach(message => addScreenshotButtonToMessage(message));
    } else {
        console.warn(`${PLUGIN_NAME}: Chat content ('${config.chatContentSelector}') not found for initial button installation.`);
        return false;
    }

    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches(config.messageSelector)) {
                addScreenshotButtonToMessage(node);
              } else if (node.querySelectorAll) {
                node.querySelectorAll(config.messageSelector).forEach(addScreenshotButtonToMessage);
              }
            }
          });
        }
      });
    });

    observer.observe(chatContentEl, { childList: true, subtree: true });
    console.log(`${PLUGIN_NAME}: 截图按钮安装逻辑已执行.`);
    return true;
}

// 添加截图按钮
function addScreenshotButtonToMessage(messageElement) {
    if (!messageElement || !messageElement.querySelector || messageElement.querySelector(`.${config.buttonClass}`)) {
      return;
    }

    let buttonsContainer = messageElement.querySelector('.mes_block .ch_name.flex-container.justifySpaceBetween .mes_buttons');
    if (!buttonsContainer) {
      buttonsContainer = messageElement.querySelector('.mes_block .mes_buttons');
      if (!buttonsContainer) {
        return;
      }
    }

    const screenshotButton = document.createElement('div');
    screenshotButton.innerHTML = '<i class="fa-solid fa-camera"></i>';
    screenshotButton.className = `${config.buttonClass} mes_button interactable`; 
    screenshotButton.title = '截图此消息 (长按显示更多选项)';
    screenshotButton.setAttribute('tabindex', '0');
    screenshotButton.style.cursor = 'pointer';

    const contextMenu = document.createElement('div');
    contextMenu.className = 'st-screenshot-context-menu';
    const bgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#555';
    const menuHoverColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintStrength') || '#4a4a4a';
    Object.assign(contextMenu.style, { display: 'none', position: 'absolute', zIndex: '10000', background: bgColor.trim(), border: `1px solid ${bgColor.trim()}`, borderRadius: '4px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)', padding: '5px 0' });

    const menuOptions = [
      { text: '截取前四条消息', action: 'prev4' }, { text: '截取前三条消息', action: 'prev3' },
      { text: '截取前两条消息', action: 'prev2' }, { text: '截取前一条消息', action: 'prev1' },
      { text: '截取后一条消息', action: 'next1' }, { text: '截取后两条消息', action: 'next2' },
      { text: '截取后三条消息', action: 'next3' }, { text: '截取后四条消息', action: 'next4' }
    ];

    menuOptions.forEach(option => {
      const menuItem = document.createElement('div');
      menuItem.className = 'st-screenshot-menu-item';
      menuItem.textContent = option.text;
      const btnBgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#3a3a3a';
      Object.assign(menuItem.style, { padding: '8px 12px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'background-color 0.2s', backgroundColor: btnBgColor.trim() });
      menuItem.onmouseover = () => menuItem.style.backgroundColor = menuHoverColor.trim();
      menuItem.onmouseout = () => menuItem.style.backgroundColor = btnBgColor.trim();
      menuItem.onclick = async (e) => {
        e.stopPropagation(); 
        hideContextMenu();
        await captureMultipleMessagesFromContextMenu(messageElement, option.action); // Calls the updated multi-capture
      };
      contextMenu.appendChild(menuItem);
    });
    document.body.appendChild(contextMenu);

    let pressTimer, isLongPress = false;
    function showContextMenu(x, y) {
      contextMenu.style.display = 'block';
      const vpW = window.innerWidth, vpH = window.innerHeight;
      const menuW = contextMenu.offsetWidth, menuH = contextMenu.offsetHeight;
      if (x + menuW > vpW) x = vpW - menuW - 5;
      if (y + menuH > vpH) y = vpH - menuH - 5;
      if (y < 0) y = 5;
      contextMenu.style.left = `${x}px`; contextMenu.style.top = `${y}px`;
    }
    function hideContextMenu() { contextMenu.style.display = 'none'; }

    screenshotButton.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true; const rect = screenshotButton.getBoundingClientRect();
        showContextMenu(rect.left, rect.bottom + 5);
      }, 500);
    });
    screenshotButton.addEventListener('mouseup', () => clearTimeout(pressTimer));
    screenshotButton.addEventListener('mouseleave', () => clearTimeout(pressTimer));
    screenshotButton.addEventListener('touchstart', (e) => {
      isLongPress = false;
      pressTimer = setTimeout(() => {
        isLongPress = true; const rect = screenshotButton.getBoundingClientRect();
        showContextMenu(rect.left, rect.bottom + 5);
      }, 500);
    });
    screenshotButton.addEventListener('touchend', () => clearTimeout(pressTimer));
    screenshotButton.addEventListener('touchcancel', () => clearTimeout(pressTimer));
    document.addEventListener('click', (e) => {
      if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target) && !screenshotButton.contains(e.target)) {
          hideContextMenu();
      }
    });
    screenshotButton.addEventListener('contextmenu', (e) => e.preventDefault());

    screenshotButton.addEventListener('click', async function(event) {
      event.preventDefault(); event.stopPropagation();
      if (isLongPress) { isLongPress = false; return; }
      if (this.classList.contains('loading')) return;

      const iconElement = this.querySelector('i');
      const originalIconClass = iconElement ? iconElement.className : '';
      if (iconElement) iconElement.className = `fa-solid fa-spinner fa-spin ${config.buttonClass}-icon-loading`;
      this.classList.add('loading');

      try {
        const dataUrl = await captureElementWithHtmlToImage(messageElement, {}); // Updated call
        downloadImage(dataUrl, messageElement, 'message');
      } catch (error) {
        console.error('消息截图失败 (html-to-image button click):', error.stack || error);
        alert(`截图失败: ${error.message || '未知错误'}`);
      } finally {
        if (iconElement) iconElement.className = originalIconClass;
        this.classList.remove('loading');
      }
    });

    const extraMesButtons = buttonsContainer.querySelector('.extraMesButtons.visible');
    const editButton = buttonsContainer.querySelector('.mes_button.mes_edit.fa-solid.fa-pencil.interactable');
    if (extraMesButtons && editButton) {
      editButton.insertAdjacentElement('beforebegin', screenshotButton);
    } else {
      const existingButton = buttonsContainer.querySelector('.fa-edit, .mes_edit');
      if (existingButton) {
        existingButton.insertAdjacentElement('beforebegin', screenshotButton);
      } else {
        buttonsContainer.appendChild(screenshotButton);
      }
    }
}

// 处理上下文菜单操作
async function captureMultipleMessagesFromContextMenu(currentMessageElement, action) {
    console.log(`[多消息截图 ctx menu html-to-image] Action: ${action} from msg:`, currentMessageElement);
    const button = currentMessageElement.querySelector(`.${config.buttonClass}`);
    const iconElement = button ? button.querySelector('i') : null;
    const originalIconClass = iconElement ? iconElement.className : '';

    if (button) button.classList.add('loading');
    if (iconElement) iconElement.className = `fa-solid fa-spinner fa-spin ${config.buttonClass}-icon-loading`;

    try {
        const chatContent = document.querySelector(config.chatContentSelector);
        if (!chatContent) throw new Error(`无法进行多消息截图，聊天内容容器 '${config.chatContentSelector}' 未找到!`);
        
        let allMessages = Array.from(chatContent.querySelectorAll(config.messageSelector));
        let currentIndex = allMessages.indexOf(currentMessageElement);
        if (currentIndex === -1) throw new Error('无法确定当前消息位置');

        let startIndex = currentIndex, endIndex = currentIndex;
        switch (action) {
            case 'prev4': startIndex = Math.max(0, currentIndex - 4); break;
            case 'prev3': startIndex = Math.max(0, currentIndex - 3); break;
            case 'prev2': startIndex = Math.max(0, currentIndex - 2); break;
            case 'prev1': startIndex = Math.max(0, currentIndex - 1); break;
            case 'next1': endIndex = Math.min(allMessages.length - 1, currentIndex + 1); break;
            case 'next2': endIndex = Math.min(allMessages.length - 1, currentIndex + 2); break;
            case 'next3': endIndex = Math.min(allMessages.length - 1, currentIndex + 3); break;
            case 'next4': endIndex = Math.min(allMessages.length - 1, currentIndex + 4); break;
            default: throw new Error(`未知多消息截图动作: ${action}`);
        }

        const targetMessages = allMessages.slice(startIndex, endIndex + 1);
        if (targetMessages.length === 0) throw new Error('无法获取目标消息进行多条截图');

        const dataUrl = await captureMultipleMessagesWithHtmlToImage(targetMessages, action, {}); // Updated call

        if (dataUrl) {
            const actionTextMap = { 'prev4':'前四条', 'prev3':'前三条', 'prev2':'前两条', 'prev1':'前一条', 'next1':'后一条', 'next2':'后两条', 'next3':'后三条', 'next4':'后四条' };
            const fileNameHint = `ST消息组_${actionTextMap[action] || action}`;
            downloadImage(dataUrl, currentMessageElement, fileNameHint);
        } else {
            throw new Error('多消息截图 html-to-image 生成失败');
        }
    } catch (error) {
        console.error(`[多消息截图 ctx menu html-to-image] 失败 (${action}):`, error.stack || error);
        alert(`截图 (${action}) 失败: ${error.message || '未知错误'}`);
    } finally {
        if (iconElement) iconElement.className = originalIconClass;
        if (button) button.classList.remove('loading');
    }
}


// 下载图片功能
function downloadImage(dataUrl, messageElement = null, typeHint = 'screenshot') {
    const link = document.createElement('a');
    let filename = `SillyTavern_${typeHint.replace(/[^a-z0-9_-]/gi, '_')}`;
    if (messageElement && typeof messageElement.querySelector === 'function') {
      const nameSelector = config.messageHeaderSelector + ' .name_text';
      const nameFallbackSelector = config.messageHeaderSelector;
      const nameTextElement = messageElement.querySelector(nameSelector) || messageElement.querySelector(nameFallbackSelector);
      let senderName = 'Character';
      if (nameTextElement && nameTextElement.textContent) {
          senderName = nameTextElement.textContent.trim() || 'Character';
      }
      const isUser = messageElement.classList.contains('user_mes') || (messageElement.closest && messageElement.closest('.user_mes'));
      const sender = isUser ? 'User' : senderName;
      const msgIdData = messageElement.getAttribute('mesid') || messageElement.dataset.msgId || messageElement.id;
      const msgId = msgIdData ? msgIdData.slice(-5) : ('m' + Date.now().toString().slice(-8, -4));
      const timestampAttr = messageElement.dataset.timestamp || messageElement.getAttribute('data-timestamp') || new Date().toISOString();
      const timestamp = timestampAttr.replace(/[:\sTZ.]/g, '_').replace(/__+/g, '_');
      const filenameSafeSender = sender.replace(/[^a-z0-9_-]/gi, '_').substring(0, 20);
      filename = `SillyTavern_${filenameSafeSender}_${msgId}_${timestamp}`;
    } else {
      filename += `_${new Date().toISOString().replace(/[:.TZ]/g, '-')}`;
    }
    link.download = `${filename}.png`;
    link.href = dataUrl;
    link.click();
    console.log(`Image downloaded as ${filename}.png`);
}

// 创建遮罩层
function createOverlay(message) {
    const overlay = document.createElement('div');
    overlay.className = 'st-capture-overlay';
    const statusBox = document.createElement('div');
    statusBox.className = 'st-capture-status';
    const messageP = document.createElement('p');
    messageP.textContent = message;
    statusBox.appendChild(messageP);
    const progressContainer = document.createElement('div');
    progressContainer.className = 'st-progress';
    const progressBar = document.createElement('div');
    progressBar.className = 'st-progress-bar';
    progressBar.style.width = '0%';
    progressContainer.appendChild(progressBar);
    statusBox.appendChild(progressContainer);
    overlay.appendChild(statusBox);
    return overlay;
}

// 更新遮罩层
function updateOverlay(overlay, message, progressRatio) {
    if (!overlay || !overlay.parentNode) return;
    const messageP = overlay.querySelector('.st-capture-status p');
    const progressBar = overlay.querySelector('.st-progress-bar');
    if (messageP) messageP.textContent = message;
    const safeProgress = Math.max(0, Math.min(1, progressRatio));
    if (progressBar) progressBar.style.width = `${Math.round(safeProgress * 100)}%`;
}

// 自定义设置弹窗
function showSettingsPopup() {
    const settings = getPluginSettings();
    
    const overlay = document.createElement('div');
    overlay.className = 'st-settings-overlay';
    Object.assign(overlay.style, { position: 'fixed', top: '0', left: '0', width: '100%', height: '100%', zIndex: '10000', display: 'flex', justifyContent: 'center', maxHeight:'90vh', alignItems:'flex-start' });

    const popup = document.createElement('div');
    popup.className = 'st-settings-popup';
    const bgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintColor') || '#2a2a2a';
    const boxBorderColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#555';
    Object.assign(popup.style, { 
        backgroundColor: bgColor.trim(), 
        border: `1px solid ${boxBorderColor.trim()}`,
        padding: '20px', 
        borderRadius: '10px', 
        maxWidth: '400px', 
        width: '100%', 
        maxHeight: '80vh', 
        marginTop: '30vh', 
        overflowY: 'auto'
    });
    
    const title = document.createElement('h3');
    title.textContent = '截图设置';
    Object.assign(title.style, { marginTop: '0', marginBottom: '15px', textAlign: 'center' });
    popup.appendChild(title);
    
    const settingsConfig = [
        { id: 'screenshotDelay', type: 'number', label: '截图前延迟 (ms)', min: 0, max: 2000, step: 50 },
        { id: 'screenshotScale', type: 'number', label: '渲染比例 (Scale)', min: 0.5, max: 4.0, step: 0.1 },
        { id: 'useForeignObjectRendering', type: 'checkbox', label: '尝试SVG对象渲染' }
    ];
    
    settingsConfig.forEach(setting => {
        const settingContainer = document.createElement('div');
        Object.assign(settingContainer.style, { margin: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' });
        
        const label = document.createElement('label');
        label.textContent = setting.label;
        label.style.marginRight = '10px';
        settingContainer.appendChild(label);
        
        let input;
        if (setting.type === 'checkbox') {
            input = document.createElement('input');
            input.type = 'checkbox';
            input.id = `st_setting_popup_${setting.id}`; // Ensure unique IDs for popup
            input.checked = settings[setting.id];
        } else if (setting.type === 'number') {
            input = document.createElement('input');
            input.type = 'number';
            input.id = `st_setting_popup_${setting.id}`;
            input.min = setting.min;
            input.max = setting.max;
            input.step = setting.step;
            input.value = settings[setting.id];
            input.style.width = '80px';
        }
        
        settingContainer.appendChild(input);
        popup.appendChild(settingContainer);
    });
    
    const buttonContainer = document.createElement('div');
    Object.assign(buttonContainer.style, { display: 'flex', justifyContent: 'center', marginTop: '2px' });
    
    const saveButton = document.createElement('button');
    saveButton.textContent = '保存设置';
    const saveButtonBgColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBorderColor') || '#4dabf7';
    const saveButtonHoverColor = getComputedStyle(document.body).getPropertyValue('--SmartThemeBlurTintStrength') || '#5db8ff';
    Object.assign(saveButton.style, { 
        padding: '8px 16px', 
        borderRadius: '4px', 
        backgroundColor: saveButtonBgColor.trim(), 
        border: 'none', 
        color: 'white', 
        cursor: 'pointer' 
    });
    
    saveButton.addEventListener('click', () => {
        // 1. 获取并保存所有设置
        const currentSettings = getPluginSettings();
        settingsConfig.forEach(setting => {
            const input = document.getElementById(`st_setting_popup_${setting.id}`);
            if (setting.type === 'checkbox') {
                currentSettings[setting.id] = input.checked;
            } else {
                const v = parseFloat(input.value);
                currentSettings[setting.id] = isNaN(v) ? defaultSettings[setting.id] : v;
            }
        });
        saveSettingsDebounced();
        loadConfig();

        // 2. 更新按钮安装状态
        if (currentSettings.autoInstallButtons) {
            document.querySelectorAll(`.${config.buttonClass}`).forEach(btn => btn.remove());
            installScreenshotButtons();
        } else {
            document.querySelectorAll(`.${config.buttonClass}`).forEach(btn => btn.remove());
        }

        // 3. 关闭弹窗
        document.body.removeChild(overlay);

        // 4. 弹出 toastr 提示
        if (window.toastr && typeof toastr.success === 'function') {
            toastr.success('设置已成功保存！');
        }

        // 添加隐藏的输入控件以保留功能
        const hiddenInputs = document.createElement('div');
        hiddenInputs.style.display = 'none';
        
        const autoInstallInput = document.createElement('input');
        autoInstallInput.type = 'checkbox';
        autoInstallInput.id = 'st_setting_popup_autoInstallButtons';
        autoInstallInput.checked = currentSettings.autoInstallButtons;
        hiddenInputs.appendChild(autoInstallInput);
        
        const altButtonInput = document.createElement('input');
        altButtonInput.type = 'checkbox';
        altButtonInput.id = 'st_setting_popup_altButtonLocation';
        altButtonInput.checked = currentSettings.altButtonLocation;
        hiddenInputs.appendChild(altButtonInput);
        
        const debugOverlayInput = document.createElement('input');
        debugOverlayInput.type = 'checkbox';
        debugOverlayInput.id = 'st_setting_popup_debugOverlay';
        debugOverlayInput.checked = currentSettings.debugOverlay;
        hiddenInputs.appendChild(debugOverlayInput);
        
        popup.appendChild(hiddenInputs);
    });
    
    buttonContainer.appendChild(saveButton);
    popup.appendChild(buttonContainer);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
}
