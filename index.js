const { 
    Client, 
    GatewayIntentBits, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    REST,
    Routes,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');

const fs = require('fs');
const path = require('path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const PREFIX = '!';
const DB_FILE = path.join(__dirname, 'database.json');

// 🟢 ระบบฐานข้อมูลถาวร
let db = {
    dotRoleConfigs: {},
    welcomeConfigs: {},
    boostConfigs: {},
    userBalances: {},
    shopItems: {},       // { guildId: [ { roleId, price, stock, category } ] }
    shopLogsConfig: {},  // { guildId: { topupLogId, shopLogId, promptpay, accountName, truewallet, qrImageUrl } }
    shopMessages: {}     // { guildId: { channelId, messageId, title, description, bannerUrl, thumbnailUrl } }
};

function loadDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
        } else {
            saveDatabase();
        }
    } catch (err) {
        console.error('❌ Error Loading Database:', err);
    }
}

function saveDatabase() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 4), 'utf8');
    } catch (err) {
        console.error('❌ Error Saving Database:', err);
    }
}

loadDatabase();

function isValidHttpUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;  
    }
}

// 📌 อัปเดตหน้าร้านค้าอัตโนมัติใน Discord ทันที (ไม่เกิน 1-5 วินาที)
async function updateShopMessage(guild) {
    const shopData = db.shopMessages[guild.id];
    if (!shopData) return;

    try {
        const channel = await guild.channels.fetch(shopData.channelId).catch(() => null);
        if (!channel) return;

        const shopEmbed = new EmbedBuilder()
            .setTitle(shopData.title || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์')
            .setColor('#2ECC71')
            .setDescription(shopData.description || 'เลือกซื้อยศที่คุณต้องการได้จากเมนูด้านล่างนี้')
            .setTimestamp();

        if (shopData.bannerUrl && isValidHttpUrl(shopData.bannerUrl)) shopEmbed.setImage(shopData.bannerUrl);
        if (shopData.thumbnailUrl && isValidHttpUrl(shopData.thumbnailUrl)) shopEmbed.setThumbnail(shopData.thumbnailUrl);

        const items = db.shopItems[guild.id] || [];
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_buy_shop_role')
            .setPlaceholder('🛒 เลือกซื้อยศที่ต้องการ...');

        if (items.length > 0) {
            items.forEach(item => {
                const role = guild.roles.cache.get(item.roleId);
                if (role) {
                    const stockText = item.stock > 0 ? `เหลือ ${item.stock} ชิ้น` : '❌ หมด';
                    selectMenu.addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`${role.name} - ${item.price} บาท [${stockText}]`)
                            .setValue(role.id)
                            .setDescription(`หมวดหมู่: ${item.category || 'ทั่วไป'} | สต็อกคงเหลือ: ${item.stock}`)
                    );
                }
            });
        } else {
            selectMenu.addOptions(
                new StringSelectMenuOptionBuilder()
                    .setLabel('ยังไม่มีสินค้า')
                    .setValue('none')
                    .setDescription('โปรดเพิ่มยศผ่าน /add-shop-item')
            );
        }

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_topup_truemoney').setLabel('🧧 เติมเงิน TrueMoney').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_topup_promptpay').setLabel('📲 เติมเงิน / QR PromptPay').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('btn_check_bal').setLabel('💰 เช็กยอดเงิน').setStyle(ButtonStyle.Secondary)
        );

        const menuRow = new ActionRowBuilder().addComponents(selectMenu);

        if (shopData.messageId) {
            const msg = await channel.messages.fetch(shopData.messageId).catch(() => null);
            if (msg) {
                await msg.edit({ embeds: [shopEmbed], components: [menuRow, btnRow] });
                return;
            }
        }

        const newMsg = await channel.send({ embeds: [shopEmbed], components: [menuRow, btnRow] });
        db.shopMessages[guild.id].messageId = newMsg.id;
        saveDatabase();
    } catch (err) {
        console.error('❌ Update Shop Message Error:', err);
    }
}

// 📌 ลงทะเบียน Slash Commands (รวมระบบเสกเงิน /give-money)
const commands = [
    new SlashCommandBuilder()
        .setName('give-money')
        .setDescription('🪄 [แอดมิน] เสกเงิน / เพิ่มเครดิตให้แก่สมาชิกที่ต้องการ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(opt => opt.setName('user').setDescription('เลือกสมาชิกที่ต้องการเสกเงินให้').setRequired(true))
        .addIntegerOption(opt => opt.setName('amount').setDescription('จำนวนเงินที่ต้องการเพิ่ม (บาท)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-shop')
        .setDescription('ตั้งค่าห้องและส่งหน้าร้านค้าขายยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งหน้าร้านค้า').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบาย').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูป Banner ส่วนบน').setRequired(false))
        .addStringOption(opt => opt.setName('thumbnail_url').setDescription('ลิงก์รูปโลโก้เล็ก').setRequired(false)),

    new SlashCommandBuilder()
        .setName('add-shop-item')
        .setDescription('เพิ่ม/แก้ไข ยศที่ต้องการขายและกำหนดราคา (อัปเดตหน้าร้านทันที)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการขาย').setRequired(true))
        .addIntegerOption(opt => opt.setName('price').setDescription('กำหนดราคา (บาท)').setRequired(true))
        .addIntegerOption(opt => opt.setName('stock').setDescription('จำนวนสต็อกสินค้า').setRequired(true))
        .addStringOption(opt => opt.setName('category').setDescription('หมวดหมู่สินค้า').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop-logs')
        .setDescription('ตั้งค่าห้อง Log, บัญชีชำระเงิน และลิงก์รูป QR Code ร้านค้า')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('topup_log').setDescription('เลือกห้อง Log เติมเงิน/แจ้งสลิป').setRequired(true))
        .addChannelOption(opt => opt.setName('shop_log').setDescription('เลือกห้อง Log ซื้อขายสินค้า').setRequired(true))
        .addStringOption(opt => opt.setName('promptpay').setDescription('เบอร์พร้อมเพย์/เลขบัญชี').setRequired(false))
        .addStringOption(opt => opt.setName('account_name').setDescription('ชื่อบัญชี').setRequired(false))
        .addStringOption(opt => opt.setName('truewallet').setDescription('เบอร์ TrueMoney Wallet').setRequired(false))
        .addStringOption(opt => opt.setName('qr_image_url').setDescription('ลิงก์รูปภาพ QR Code พร้อมเพย์ของร้าน').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกกดรับยศไม่จำกัด (ใส่ ID คั่นด้วย ,)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่ง Dropdown').setRequired(true))
        .addStringOption(opt => opt.setName('role_ids').setDescription('ไอดี ยศ คั่นด้วยจุลภาค').setRequired(true))
        .addStringOption(opt => opt.setName('placeholder').setDescription('ข้อความแสดงบน Dropdown').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup_buttons')
        .setDescription('เพิ่มปุ่มกดรับยศใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องที่ต้องการเพิ่มปุ่ม').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการแจก').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('ข้อความบนปุ่มกด').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-dot-role')
        .setDescription('ตั้งค่าห้องพิมพ์จุด (.) เพื่อรับยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้อง').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศ').setRequired(true))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูป Banner').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('ตั้งค่าห้องและข้อความต้อนรับคนเข้าดิส')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องต้อนรับ').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('ยศที่จะแจกให้อัตโนมัติ').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์ Banner ต้อนรับ').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-welcome')
        .setDescription('ทดสอบการทำงานระบบต้อนรับ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-boost')
        .setDescription('ตั้งค่าห้องขอบคุณคน Boost เซิร์ฟเวอร์')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องแจ้งเตือน Boost').setRequired(true)),

    new SlashCommandBuilder()
        .setName('test-boost')
        .setDescription('ทดสอบส่งข้อความแจ้งเตือน Boost')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('สร้างปุ่มกดเปิดตั๋วร้องเรียน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งปุ่ม Ticket').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('สร้างปุ่มรายงานผู้กระทำผิด')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งปุ่ม Report').setRequired(true)),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('แผงควบคุมเสกเงินและจัดการผู้ใช้สำหรับแอดมิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งแผงควบคุม').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์พร้อมใช้งาน: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ Synchronized All Commands Successfully!');
    } catch (error) {
        console.error('❌ Synchronize Commands Failed:', error);
    }
});

// 🛠️ การ์ดต้อนรับ
async function sendWelcomeCard(channel, member, role, bannerUrl = null) {
    const embed = new EmbedBuilder()
        .setTitle('🎉 ยินดีต้อนรับสมาชิกใหม่!')
        .setColor('#2ECC71')
        .setDescription(`✨ ยินดีต้อนรับคุณ <@${member.id}> เข้าสู่เซิร์ฟเวอร์!\nระบบได้ทำการมอบยศให้เรียบร้อยแล้วครับ ✅`)
        .addFields(
            { name: '🏷️ ยศที่ได้รับ', value: role ? `<@&${role.id}>` : '`ไม่มีการมอบยศ`', inline: true },
            { name: '📌 สถานะ', value: '`สำเร็จเรียบร้อย`', inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `${member.guild.name} • ระบบรับยศอัตโนมัติ` });

    if (bannerUrl && isValidHttpUrl(bannerUrl)) embed.setImage(bannerUrl);

    const outsideMessage = role ? `<@&${role.id}> ✨ <@${member.id}> ได้รับยศเรียบร้อยแล้ว!` : `✨ <@${member.id}> ยินดีต้อนรับสู่เซิร์ฟเวอร์!`;
    await channel.send({ content: outsideMessage, embeds: [embed] }).catch(() => null);
}

// 🔴 สมาชิกใหม่เข้าดิสคอร์ด
client.on('guildMemberAdd', async (member) => {
    const wCfg = db.welcomeConfigs[member.guild.id];
    if (!wCfg) return;

    const ch = member.guild.channels.cache.get(wCfg.channelId);
    if (!ch) return;

    let role = wCfg.roleId ? member.guild.roles.cache.get(wCfg.roleId) : null;
    if (role) await member.roles.add(role).catch(() => null);

    await sendWelcomeCard(ch, member, role, wCfg.bannerUrl);
});

// 🔴 Message Event
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const cfg = db.shopLogsConfig[message.guild.id];

    // 🔴 ตรวจจับรูปสลิปส่งเข้า Log เติมเงินอัตโนมัติ
    if (message.attachments.size > 0 && cfg?.topupLogId) {
        const isImage = message.attachments.some(att => att.contentType && att.contentType.startsWith('image/'));
        if (isImage) {
            const logCh = message.guild.channels.cache.get(cfg.topupLogId);
            if (logCh && message.channel.id !== cfg.topupLogId) {
                const slipEmbed = new EmbedBuilder()
                    .setTitle('🧾 แจ้งสลิปการโอนเงินใหม่')
                    .setColor('#3498DB')
                    .addFields(
                        { name: '👤 ผู้ส่งสลิป', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
                        { name: '📍 ส่งจากช่อง', value: `<#${message.channel.id}>`, inline: true }
                    )
                    .setImage(message.attachments.first().url)
                    .setTimestamp();

                await logCh.send({ embeds: [slipEmbed] }).catch(() => null);
            }
        }
    }

    // 🔴 ระบบพิมพ์จุด (.) เพื่อรับยศ
    const dotCfg = db.dotRoleConfigs[message.guild.id];
    if (dotCfg && message.channel.id === dotCfg.channelId) {
        const content = message.content.trim();
        if (content === '.' || content === '!') {
            const role = message.guild.roles.cache.get(dotCfg.roleId);
            if (role) {
                if (!message.member.roles.cache.has(role.id)) {
                    await message.member.roles.add(role).catch(() => null);
                    await sendWelcomeCard(message.channel, message.member, role, dotCfg.bannerUrl);
                } else {
                    await message.reply(`💡 คุณมียศ **${role.name}** อยู่แล้ว`).catch(() => null);
                }
            }
            return;
        }
    }

    if (!message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'botsetup') {
        const embed = new EmbedBuilder()
            .setTitle('🤖 คู่มือการตั้งค่าและคำสั่งทั้งหมดของบอท')
            .setColor('#3498DB')
            .setDescription('คำสั่งจัดการระบบทั้งหมดภายในเซิร์ฟเวอร์')
            .addFields(
                { name: '🛍️ ระบบร้านค้าขายยศ & เติมเงิน', value: '• `/setup-shop` : ตั้งค่าหน้าร้าน\n• `/add-shop-item` : เพิ่มยศและสต็อก (อัปเดตหน้าร้านทันที)\n• `/setup-shop-logs` : ตั้งค่าห้อง Log, บัญชีชำระเงิน และรูป QR Code' },
                { name: '🎭 ระบบรับยศ', value: '• `/setup_dropdown` : Dropdown รับยศ\n• `/setup_buttons` : ปุ่มรับยศ\n• `/setup-dot-role` : พิมพ์จุดรับยศ' },
                { name: '🎟️ ระบบจัดการ & แอดมิน', value: '• `/give-money` : คำสั่งเสกเงินให้ผู้ใช้ที่ต้องการ\n• `/setup-ticket` : ระบบตั๋ว\n• `/setup-report` : แจ้งผู้ทำผิด\n• `/setup-admin` : แผงควบคุมเสกเงิน' },
                { name: '📊 Prefix Commands', value: '• `!status` : เช็กคนไม่มียศ\n• `!botsetup` : เปิดดูคู่มือนี้' }
            );

        return message.channel.send({ embeds: [embed] });
    }

    if (command === 'status') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) return;
        await message.guild.members.fetch();
        const noRoleMembers = message.guild.members.cache.filter(m => m.roles.cache.size <= 1 && !m.user.bot);

        const embed = new EmbedBuilder()
            .setTitle('📊 รายชื่อสมาชิกที่ไม่มียศ')
            .setColor('#E74C3C')
            .setDescription(noRoleMembers.size > 0 ? noRoleMembers.map(m => `• <@${m.id}> (\`${m.user.tag}\`)`).join('\n').slice(0, 4000) : '🎉 ทุกคนมียศครบแล้ว!')
            .setFooter({ text: `จำนวนคนไม่มียศ: ${noRoleMembers.size} คน` });

        return message.reply({ embeds: [embed] });
    }
});

// 🔴 Interaction Router
client.on('interactionCreate', async (interaction) => {
    try {
        // --- 1. SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            // 📌 0. คำสั่งเสกเงินแอดมิน (/give-money)
            if (interaction.commandName === 'give-money') {
                const targetUser = interaction.options.getUser('user');
                const amount = interaction.options.getInteger('amount');

                if (amount <= 0) {
                    return await interaction.editReply({ content: '❌ จำนวนเงินต้องมากกว่า 0 บาท' });
                }

                db.userBalances[targetUser.id] = (db.userBalances[targetUser.id] || 0) + amount;
                saveDatabase();

                const embed = new EmbedBuilder()
                    .setTitle('🪄 เสกเงิน / เพิ่มเครดิตสำเร็จ!')
                    .setColor('#2ECC71')
                    .addFields(
                        { name: '👤 ผู้รับเงิน', value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
                        { name: '💵 จำนวนเงินที่เพิ่ม', value: `\`+${amount}\` บาท`, inline: true },
                        { name: '💰 ยอดเงินรวมสะสม', value: `\`${db.userBalances[targetUser.id]}\` บาท`, inline: true }
                    )
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            // 1. /setup-shop
            if (interaction.commandName === 'setup-shop') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'เลือกซื้อยศที่คุณต้องการได้จากเมนูด้านล่างนี้';
                const bannerUrl = interaction.options.getString('banner_url');
                const thumbnailUrl = interaction.options.getString('thumbnail_url');

                db.shopMessages[interaction.guild.id] = {
                    channelId: channel.id,
                    messageId: null,
                    title,
                    description,
                    bannerUrl,
                    thumbnailUrl
                };
                saveDatabase();

                await updateShopMessage(interaction.guild);
                return await interaction.editReply({ content: `✅ สร้างและบันทึกหน้าร้านค้าในช่อง <#${channel.id}> เรียบร้อยแล้ว!` });
            }

            // 2. /add-shop-item
            if (interaction.commandName === 'add-shop-item') {
                const role = interaction.options.getRole('role');
                const price = interaction.options.getInteger('price');
                const stock = interaction.options.getInteger('stock');
                const category = interaction.options.getString('category') || 'ทั่วไป';

                db.shopItems[interaction.guild.id] = db.shopItems[interaction.guild.id] || [];
                
                const existingIdx = db.shopItems[interaction.guild.id].findIndex(i => i.roleId === role.id);
                if (existingIdx !== -1) {
                    db.shopItems[interaction.guild.id][existingIdx] = { roleId: role.id, price, stock, category };
                } else {
                    db.shopItems[interaction.guild.id].push({ roleId: role.id, price, stock, category });
                }
                saveDatabase();

                await updateShopMessage(interaction.guild);

                return await interaction.editReply({ content: `✅ เพิ่ม/แก้ไขยศ **${role.name}** ราคา **${price}** บาท [สต็อก: ${stock}] เรียบร้อย! หน้าร้านค้าอัปเดตทันที` });
            }

            // 3. /setup-shop-logs
            if (interaction.commandName === 'setup-shop-logs') {
                const topupLog = interaction.options.getChannel('topup_log');
                const shopLog = interaction.options.getChannel('shop_log');
                const promptpay = interaction.options.getString('promptpay') || 'ไม่ระบุ';
                const accountName = interaction.options.getString('account_name') || 'ไม่ระบุ';
                const truewallet = interaction.options.getString('truewallet') || 'ไม่ระบุ';
                const qrImageUrl = interaction.options.getString('qr_image_url') || null;

                db.shopLogsConfig[interaction.guild.id] = { 
                    topupLogId: topupLog.id, 
                    shopLogId: shopLog.id, 
                    promptpay, 
                    accountName, 
                    truewallet,
                    qrImageUrl
                };
                saveDatabase();

                return await interaction.editReply({ content: '✅ บันทึกช่อง Log, ข้อมูลบัญชี และรูปภาพ QR Code พร้อมเพย์เรียบร้อยแล้ว!' });
            }

            // 4. /setup_dropdown
            if (interaction.commandName === 'setup_dropdown') {
                const channel = interaction.options.getChannel('channel');
                const rawIds = interaction.options.getString('role_ids');
                const placeholder = interaction.options.getString('placeholder') || '🎭 เลือกยศที่คุณต้องการที่นี่...';

                const roleIds = rawIds.split(',').map(id => id.trim());
                const selectMenu = new StringSelectMenuBuilder().setCustomId('select_custom_roles').setPlaceholder(placeholder);

                roleIds.forEach(id => {
                    const role = interaction.guild.roles.cache.get(id);
                    if (role) {
                        selectMenu.addOptions(new StringSelectMenuOptionBuilder().setLabel(role.name).setValue(role.id));
                    }
                });

                await channel.send({ content: '👇 **เลือกรับยศประจำตัวของคุณได้ที่เมนูด้านล่าง:**', components: [new ActionRowBuilder().addComponents(selectMenu)] });
                return await interaction.editReply({ content: `✅ ส่ง Dropdown เลือกรับยศสำเร็จ!` });
            }

            // 5. /setup_buttons
            if (interaction.commandName === 'setup_buttons') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const label = interaction.options.getString('label') || role.name;

                const btn = new ButtonBuilder().setCustomId(`btn_role_${role.id}`).setLabel(label).setStyle(ButtonStyle.Primary);
                await channel.send({ content: `กดปุ่มด้านล่างเพื่อรับยศ <@&${role.id}>`, components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ เพิ่มปุ่มรับยศสำเร็จ!` });
            }

            // 6. /setup-dot-role
            if (interaction.commandName === 'setup-dot-role') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url');

                db.dotRoleConfigs[interaction.guild.id] = { channelId: channel.id, roleId: role.id, bannerUrl };
                saveDatabase();

                const embed = new EmbedBuilder().setTitle('🔴 ระบบพิมพ์จุด (.) เพื่อรับยศ').setColor('#E74C3C').setDescription(`พิมพ์จุด \`.\` ในช่องนี้เพื่อรับยศ <@&${role.id}> อัตโนมัติ!`);
                if (bannerUrl && isValidHttpUrl(bannerUrl)) embed.setImage(bannerUrl);

                await channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: `✅ ตั้งค่าระบบพิมพ์จุดสำเร็จ!` });
            }

            // 7. /setup-welcome
            if (interaction.commandName === 'setup-welcome') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url');

                db.welcomeConfigs[interaction.guild.id] = { channelId: channel.id, roleId: role ? role.id : null, bannerUrl };
                saveDatabase();

                return await interaction.editReply({ content: `✅ ตั้งค่าระบบต้อนรับเรียบร้อย!` });
            }

            // 8. /test-welcome
            if (interaction.commandName === 'test-welcome') {
                const wCfg = db.welcomeConfigs[interaction.guild.id];
                const role = wCfg?.roleId ? interaction.guild.roles.cache.get(wCfg.roleId) : interaction.member.roles.highest;
                await sendWelcomeCard(interaction.channel, interaction.member, role, wCfg?.bannerUrl);
                return await interaction.editReply({ content: '✅ ทดสอบส่งข้อความต้อนรับสำเร็จ!' });
            }

            // 9. /setup-boost
            if (interaction.commandName === 'setup-boost') {
                const channel = interaction.options.getChannel('channel');
                db.boostConfigs[interaction.guild.id] = { channelId: channel.id };
                saveDatabase();
                return await interaction.editReply({ content: `✅ ตั้งค่าห้องแจ้งเตือน Boost สำเร็จ!` });
            }

            // 10. /test-boost
            if (interaction.commandName === 'test-boost') {
                const embed = new EmbedBuilder().setTitle('🚀 ขอบคุณสำหรับการ Boost เซิร์ฟเวอร์!').setColor('#F47FFF').setDescription(`ขอบคุณ <@${interaction.user.id}> ที่ช่วย Boost เซิร์ฟเวอร์ให้เรา! 💖`);
                await interaction.channel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✅ ทดสอบส่งข้อความ Boost สำเร็จ!' });
            }

            // 11. /setup-ticket
            if (interaction.commandName === 'setup-ticket') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('📩 ระบบตั๋วร้องเรียน / ติดต่อสอบถาม').setColor('#3498DB').setDescription('หากพบปัญหา ติดต่อทีมงาน กดปุ่มเปิดตั๋วด้านล่างได้เลยครับ');
                const btn = new ButtonBuilder().setCustomId('btn_open_ticket').setLabel('📩 เปิดตั๋วติดต่อแอดมิน').setStyle(ButtonStyle.Success);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างระบบ Ticket สำเร็จ!` });
            }

            // 12. /setup-report
            if (interaction.commandName === 'setup-report') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('🚨 ระบบรายงานผู้กระทำผิด').setColor('#E74C3C').setDescription('หากพบผู้เล่นทำผิดกฎ กดปุ่มด้านล่างเพื่อแจ้งทีมงานทันที');
                const btn = new ButtonBuilder().setCustomId('btn_open_report').setLabel('🚨 แจ้งผู้ทำผิดกฎ').setStyle(ButtonStyle.Danger);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างระบบ Report สำเร็จ!` });
            }

            // 13. /setup-admin
            if (interaction.commandName === 'setup-admin') {
                const channel = interaction.options.getChannel('channel');
                const embed = new EmbedBuilder().setTitle('⚙️ แผงควบคุมแอดมิน (Admin Control Panel)').setColor('#9B59B6').setDescription('ใช้ปุ่มด้านล่างเพื่อเสกเงินหรือจัดการเครดิตให้แก่สมาชิก');
                const btn = new ButtonBuilder().setCustomId('btn_admin_give_money').setLabel('🪄 เสกเงิน / เพิ่มเครดิต').setStyle(ButtonStyle.Danger);
                await channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: `✅ สร้างแผงควบคุมแอดมินสำเร็จ!` });
            }
        }

        // --- 2. BUTTON INTERACTIONS ---
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('btn_role_')) {
                const roleId = interaction.customId.replace('btn_role_', '');
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role).catch(() => null);
                    return await interaction.reply({ content: `❌ ถอดยศ **${role.name}** ออกเรียบร้อยแล้ว`, ephemeral: true });
                } else {
                    await interaction.member.roles.add(role).catch(() => null);
                    return await interaction.reply({ content: `✅ มอบยศ **${role.name}** ให้เรียบร้อยแล้ว!`, ephemeral: true });
                }
            }

            if (interaction.customId === 'btn_close_ticket') {
                await interaction.reply({ content: '🔒 กำลังปิดและลบห้องตั๋วนี้ใน 3 วินาที...' });
                setTimeout(() => interaction.channel.delete().catch(() => null), 3000);
                return;
            }

            if (interaction.customId === 'btn_check_bal' || interaction.customId === 'btn_check_balance') {
                const bal = db.userBalances[interaction.user.id] || 0;
                return await interaction.reply({ content: `💰 ยอดเงินคงเหลือของคุณคือ: **${bal}** บาท`, ephemeral: true });
            }

            if (interaction.customId === 'btn_topup_truemoney') {
                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงิน TrueMoney Wallet');
                const input = new TextInputBuilder().setCustomId('input_voucher_link').setLabel('กรอกลิงก์ซองของขวัญ TrueMoney').setStyle(TextInputStyle.Short).setPlaceholder('https://gift.truemoney.com/v1/?v=...').setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_promptpay') {
                const cfg = db.shopLogsConfig[interaction.guild.id];
                const ppNumber = cfg?.promptpay || 'ไม่ระบุ';

                const embed = new EmbedBuilder()
                    .setTitle('📲 ช่องทางชำระเงิน / เติมเงินผ่าน PromptPay')
                    .setColor('#3498DB')
                    .setDescription(
                        `💳 **พร้อมเพย์/เลขบัญชี:** \`${ppNumber}\`\n` +
                        `👤 **ชื่อบัญชี:** \`${cfg?.accountName || 'ไม่ระบุ'}\`\n` +
                        `🧧 **TrueWallet:** \`${cfg?.truewallet || 'ไม่ระบุ'}\`\n\n` +
                        `📸 **เมื่อโอนเงินเสร็จแล้ว:**\n` +
                        `กรุณาแนบภาพสลิปโอนเงินลงในช่องนี้ หรือเปิดตั๋วเพื่อแจ้งแอดมินได้เลยครับ`
                    );

                if (cfg?.qrImageUrl && isValidHttpUrl(cfg.qrImageUrl)) {
                    embed.setImage(cfg.qrImageUrl);
                }

                return await interaction.reply({ embeds: [embed], ephemeral: true });
            }

            // 📌 ปุ่มเสกเงินแอดมินใน Modal
            if (interaction.customId === 'btn_admin_give_money') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานปุ่มนี้', ephemeral: true });
                }

                const modal = new ModalBuilder().setCustomId('modal_admin_give_money').setTitle('🪄 เสกเงิน/เพิ่มเครดิตให้สมาชิก');
                const userInput = new TextInputBuilder().setCustomId('input_target_id').setLabel('User ID ของผู้รับเงิน').setStyle(TextInputStyle.Short).setPlaceholder('เช่น 123456789012345678').setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('input_amount').setLabel('จำนวนเงิน (บาท)').setStyle(TextInputStyle.Short).setPlaceholder('เช่น 100').setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userInput), new ActionRowBuilder().addComponents(amountInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_open_ticket' || interaction.customId === 'btn_open_report') {
                const isReport = interaction.customId === 'btn_open_report';
                const createdChannel = await interaction.guild.channels.create({
                    name: `${isReport ? 'report' : 'ticket'}-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                    ]
                });

                const embed = new EmbedBuilder()
                    .setTitle(isReport ? '🚨 ตั๋วแจ้งรายงานผู้กระทำผิด' : '📩 ตั๋วติดต่อทีมงาน')
                    .setColor(isReport ? '#E74C3C' : '#3498DB')
                    .setDescription(`สวัสดีครับ <@${interaction.user.id}> กรุณากรอกรายละเอียดเรื่องที่ต้องการแจ้ง พร้อมแนบสลิป/หลักฐานในช่องนี้ได้เลยครับ`);

                const closeBtn = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_close_ticket').setLabel('🔒 ปิดตั๋วนี้').setStyle(ButtonStyle.Danger)
                );

                await createdChannel.send({ embeds: [embed], components: [closeBtn] });
                return await interaction.reply({ content: `✅ สร้างห้องเปิดตั๋วเรียบร้อยแล้วที่ ${createdChannel}`, ephemeral: true });
            }
        }

        // --- 3. SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_buy_shop_role') {
                const roleId = interaction.values[0];
                if (roleId === 'none') return await interaction.reply({ content: '❌ ยังไม่มีสินค้าพร้อมจำหน่าย', ephemeral: true });

                const items = db.shopItems[interaction.guild.id] || [];
                const shopItem = items.find(i => i.roleId === roleId);

                if (!shopItem) return await interaction.reply({ content: '❌ ไม่พบสินค้านี้ในระบบ', ephemeral: true });

                if (shopItem.stock <= 0) {
                    return await interaction.reply({ content: '❌ ขออภัย ยศนี้สินค้า **หมดสต็อก** แล้ว!', ephemeral: true });
                }

                const userBal = db.userBalances[interaction.user.id] || 0;
                if (userBal < shopItem.price) {
                    return await interaction.reply({ content: `❌ ยอดเงินไม่พอ! ยศนี้ราคา **${shopItem.price}** บาท คุณมีเงินคงเหลือ **${userBal}** บาท`, ephemeral: true });
                }

                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                db.userBalances[interaction.user.id] -= shopItem.price;
                shopItem.stock -= 1;
                saveDatabase();

                await interaction.member.roles.add(role).catch(() => null);

                await updateShopMessage(interaction.guild);

                const shopCfg = db.shopLogsConfig[interaction.guild.id];
                if (shopCfg?.shopLogId) {
                    const logCh = interaction.guild.channels.cache.get(shopCfg.shopLogId);
                    if (logCh) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛍️ สถิติการซื้อสินค้าสำเร็จ')
                            .setColor('#2ECC71')
                            .addFields(
                                { name: '👤 ผู้ซื้อ', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                                { name: '🏷️ สินค้าที่ซื้อ', value: `<@&${role.id}>`, inline: true },
                                { name: '💵 ราคา', value: `\`${shopItem.price}\` บาท`, inline: true },
                                { name: '📦 สต็อกคงเหลือ', value: `\`${shopItem.stock}\` ชิ้น`, inline: true }
                            )
                            .setTimestamp();
                        await logCh.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                return await interaction.reply({ content: `🎉 **ซื้อยศสำเร็จ!** มอบยศ **${role.name}** ให้คุณเรียบร้อยแล้ว (หักเงิน ${shopItem.price} บาท | ยอดคงเหลือ: ${db.userBalances[interaction.user.id]} บาท)`, ephemeral: true });
            }

            if (interaction.customId === 'select_custom_roles') {
                const roleId = interaction.values[0];
                const role = interaction.guild.roles.cache.get(roleId);

                if (!role) return await interaction.reply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์', ephemeral: true });

                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role).catch(() => null);
                    return await interaction.reply({ content: `❌ ถอดยศ **${role.name}** เรียบร้อยแล้ว`, ephemeral: true });
                } else {
                    await interaction.member.roles.add(role).catch(() => null);
                    return await interaction.reply({ content: `🎉 มอบยศ **${role.name}** ให้เรียบร้อยแล้ว!`, ephemeral: true });
                }
            }
        }

        // --- 4. MODALS SUBMIT ---
        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            // 📌 เสกเงินผ่าน Modal
            if (interaction.customId === 'modal_admin_give_money') {
                const targetId = interaction.fields.getTextInputValue('input_target_id').trim();
                const amount = parseInt(interaction.fields.getTextInputValue('input_amount').trim(), 10);

                if (isNaN(amount) || amount <= 0) return await interaction.editReply({ content: '❌ กรุณากรอกตัวเลขจำนวนเงินให้ถูกต้อง' });

                db.userBalances[targetId] = (db.userBalances[targetId] || 0) + amount;
                saveDatabase();

                return await interaction.editReply({ content: `🪄 **เสกเงินสำเร็จ!** เพิ่มเครดิต **${amount}** บาท ให้แก่ <@${targetId}> เรียบร้อยแล้ว (ยอดเงินรวมสะสม: ${db.userBalances[targetId]} บาท)` });
            }

            if (interaction.customId === 'modal_topup_truemoney') {
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_link').trim();

                const shopCfg = db.shopLogsConfig[interaction.guild.id];
                if (shopCfg?.topupLogId) {
                    const logCh = interaction.guild.channels.cache.get(shopCfg.topupLogId);
                    if (logCh) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🧧 แจ้งส่งซองเติมเงิน TrueMoney')
                            .setColor('#F1C40F')
                            .addFields(
                                { name: '👤 ผู้ส่ง', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                                { name: '🔗 ลิงก์ซอง', value: `\`\`\`${voucherUrl}\`\`\`` }
                            )
                            .setTimestamp();
                        await logCh.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                return await interaction.editReply({ content: `📩 **ส่งลิงก์ซองของขวัญเรียบร้อยแล้ว!**\n\`${voucherUrl}\` (ระบบบันทึกข้อมูลเข้าห้อง Log เรียบร้อยแล้ว)` });
            }
        }

    } catch (err) {
        console.error('Interaction Handling Error:', err);
    }
});

client.login(TOKEN);
