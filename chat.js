// Supabase Configuration loaded from window.ENV (env.js)
const SUPABASE_URL = (window.ENV && window.ENV.SUPABASE_URL) || "https://qmykiksahxpgexjlvwju.supabase.co";
const SUPABASE_ANON_KEY = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || "sb_publishable_8j8uBy1GzTatDitIuL6pdw_Z39IbMty";

// Initialize Supabase Client
const supabase = (window.supabase && SUPABASE_URL !== "YOUR_SUPABASE_URL") 
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) 
    : null;

// Get parameters from URL
const urlParams = new URLSearchParams(window.location.search);
const alertId = urlParams.get('alert_id');
const vehicleNo = urlParams.get('vehicle_no');

const ui = {
    subtitle: document.getElementById('chatSubtitle'),
    messages: document.getElementById('chatMessages'),
    input: document.getElementById('chatInput'),
    sendBtn: document.getElementById('sendBtn')
};

let subscription = null;

async function initChat() {
    if (!alertId || !supabase) {
        ui.subtitle.textContent = "Error: Invalid chat session.";
        return;
    }
    
    ui.subtitle.textContent = `Chat for ${vehicleNo || 'Vehicle'}`;

    await loadMessages();
    subscribeToMessages();

    ui.sendBtn.addEventListener('click', sendMessage);
    ui.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    // 15-minute expiration timer (fallback)
    setTimeout(() => {
        disableChat();
        appendMessage({
            sender_type: 'owner',
            message: '⏳ This chat session has expired (15 minutes limit).'
        });
    }, 15 * 60 * 1000);
}

function disableChat() {
    ui.input.disabled = true;
    ui.sendBtn.disabled = true;
    ui.input.placeholder = "Chat ended / expired";
}

async function loadMessages() {
    try {
        const { data, error } = await supabase
            .from('alert_messages')
            .select('*')
            .eq('alert_id', alertId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        
        ui.messages.innerHTML = '';
        if (data.length === 0) {
            ui.messages.innerHTML = `<div style="text-align: center; color: #666; font-size: 0.9rem; padding-top: 20px;">
                Alert sent! Waiting for the owner to respond before you can chat.
            </div>`;
            lockChatWaitingForOwner();
        } else {
            let ownerHasReplied = false;
            data.forEach(msg => {
                if (msg.sender_type === 'owner') ownerHasReplied = true;
                appendMessage(msg);
            });
            
            if (!ownerHasReplied) {
                lockChatWaitingForOwner();
            } else {
                unlockChat();
            }
        }
        scrollToBottom();
    } catch (err) {
        console.error("Error loading messages:", err);
    }
}

let isOwnerJoined = false;

function lockChatWaitingForOwner() {
    isOwnerJoined = false;
    ui.input.disabled = true;
    ui.sendBtn.disabled = true;
    ui.input.placeholder = "Waiting for owner to reply...";
}

function unlockChat() {
    isOwnerJoined = true;
    ui.input.disabled = false;
    ui.sendBtn.disabled = false;
    ui.input.placeholder = "Type a message...";
}

function appendMessage(msg) {
    // Remove the placeholder if it exists
    if (ui.messages.innerHTML.includes('Alert sent!')) {
        ui.messages.innerHTML = '';
    }

    const div = document.createElement('div');
    div.classList.add('chat-message');
    
    if (msg.sender_type === 'passerby') {
        div.classList.add('message-passerby');
    } else {
        div.classList.add('message-owner');
        unlockChat(); // Unlock when owner replies
    }
    
    div.textContent = msg.message;
    ui.messages.appendChild(div);

    if (msg.message.includes('🚫 The owner has ended this chat session')) {
        disableChat();
    }
}

function scrollToBottom() {
    ui.messages.scrollTop = ui.messages.scrollHeight;
}

async function sendMessage() {
    const text = ui.input.value.trim();
    if (!text) return;

    ui.input.value = '';
    ui.sendBtn.disabled = true;

    try {
        const payload = {
            alert_id: alertId,
            sender_type: 'passerby',
            message: text
        };

        const { error } = await supabase
            .from('alert_messages')
            .insert([payload]);

        if (error) throw error;
        
    } catch (err) {
        console.error("Error sending message:", err);
        // Supabase RLS policy violation code is typically 42501
        if (err.code === '42501' || (err.message && err.message.toLowerCase().includes('policy'))) {
            alert("Cannot send message. The chat session has expired (15 min limit) or was ended by the owner.");
            disableChat();
        } else {
            alert("Failed to send message: " + err.message);
        }
    } finally {
        ui.sendBtn.disabled = false;
        ui.input.focus();
    }
}

function subscribeToMessages() {
    subscription = supabase
        .channel(`public:alert_messages:${alertId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'alert_messages',
            filter: `alert_id=eq.${alertId}` 
        }, payload => {
            appendMessage(payload.new);
            scrollToBottom();
        })
        .subscribe();
}

initChat();
