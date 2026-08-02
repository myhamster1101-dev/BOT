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
    PermissionFlagsBits
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// 🟢 Database จำลองใน Memory
client.dotRoleConfigs = client.dotRoleConfigs || new Map();
client.boostConfigs = client.boostConfigs || new Map();
client.welcomeConfigs = client.welcomeConfigs || new Map();
client.userBalances = client.userBalances || new Map();         // เก็บยอดเงินสมาชิก { userId: balance }
client.shopItems = client.shopItems || new Map();               // เก็บสินค้ายศ { guildId: [{ roleId, price, description, category, stock }] }
client.shopLogsConfig = client.shopLogsConfig || new Map();     // เก็บข้อมูลบัญชีและ Logs
client.shopMessageConfigs = client.shopMessageConfigs || new Map(); // เก็บข้อมูลตำแหน่งหน้าร้านค้า

// 🛠️ ฟังก์ชันแปลงข้อความที่มีตัวแปร Tag
function parseCustomTags(text, guild, member) {
    if (!text) return '';

    let parsedText = text;

    if (member) {
        parsedText = parsedText.replace(/\{user\}/g, `<@${member.id}>`);
        parsedText = parsedText.replace(/\{username\}/g, member.user?.username || member.username || 'สมาชิก');
    }
    if (guild) {
        parsedText = parsedText.replace(/\{guild\}/g, guild.name);
        parsedText = parsedText.replace(/\{boosts\}/g, `${guild.premiumSubscriptionCount || 0}`);
        parsedText = parsedText.replace(/\{level\}/g, `${guild.premiumTier}`);
        parsedText = parsedText.replace(/\{memberCount\}/g, `${guild.memberCount}`);
    }

    parsedText = parsedText.replace(/\{#([^}]+)\}/g, (match, channelName) => {
        const targetChan = guild.channels.cache.find(c => c.name.toLowerCase() === channelName.trim().toLowerCase());
        return targetChan ? `<#${targetChan.id}>` : `#${channelName}`;
    });

    parsedText = parsedText.replace(/\{@([^}]+)\}/g, (match, roleName) => {
        const targetRole = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.trim().toLowerCase());
        return targetRole ? `<@&${targetRole.id}>` : `@${roleName}`;
    });

    return parsedText;
}

// ⚡ ฟังก์ชันสร้าง Components & Embed หน้าร้านค้า
async function updateShopDisplay(guild) {
    const config = client.shopMessageConfigs.get(guild.id);
    if (!config) return false;

    const channel = guild.channels.cache.get(config.channelId);
    if (!channel || !channel.isTextBased()) return false;

    const shopMsg = await channel.messages.fetch(config.messageId).catch(() => null);
    if (!shopMsg) return false;

    const guildItems = client.shopItems.get(guild.id) || [];

    const shopEmbed = new EmbedBuilder()
        .setTitle(parseCustomTags(config.title, guild, null))
        .setColor(config.color || '#F1C40F')
        .setDescription(parseCustomTags(config.description, guild, null))
        .setTimestamp();

    if (config.bannerUrl && config.bannerUrl.startsWith('http')) shopEmbed.setImage(config.bannerUrl);

    const shopSelect = new StringSelectMenuBuilder()
        .setCustomId('select_buy_shop_role')
        .setPlaceholder('🛒 เลือกยศที่คุณต้องการซื้อที่นี่...');

    let decorateStockCount = 0; // ยศตกแต่ง
    let otherStockCount = 0;    // ยศอื่นๆ
    let validItemCount = 0;

    if (guildItems.length > 0) {
        guildItems.forEach((item) => {
            const roleObj = guild.roles.cache.get(item.roleId);
            if (roleObj && item.stock > 0) {
                validItemCount++;
                
                if (item.category === 'ยศตกแต่ง') {
                    decorateStockCount++;
                } else {
                    otherStockCount++;
                }
                
                shopSelect.addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${roleObj.name} | ${item.category}`)
                        .setValue(item.roleId)
                        .setDescription(`💰 ราคา: ${item.price} บาท | 📦 คงเหลือ: ${item.stock} ชิ้น`)
                );
            }
        });
    }

    let summaryText = '';
    if (validItemCount === 0) {
        summaryText = '⚠️ ยังไม่มีรายการยศในระบบที่พร้อมจำหน่าย (แอดมินใช้ `/add-shop-item` เพื่อใส่ยศและจำนวนเข้าในร้านค้าได้เลย)';
    } else {
        summaryText = `📊 **สรุปจำนวนรายการยศที่พร้อมจำหน่าย:**\n` +
                      `🎨 **ยศตกแต่ง:** ${decorateStockCount} รายการ\n` +
                      `⭐ **ยศอื่นๆ:** ${otherStockCount} รายการ`;
    }

    shopEmbed.addFields({ name: '📜 รายการยศที่มีจำหน่ายอัตโนมัติ', value: summaryText });

    const components = [];

    if (validItemCount > 0) {
        components.push(new ActionRowBuilder().addComponents(shopSelect));
    }

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_topup_truemoney').setLabel('🧧 เติมเงิน TrueMoney').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_topup_promptpay').setLabel('📲 เติมเงิน PromptPay / QR Code').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_check_balance').setLabel('💰 เช็กยอดเงินคงเหลือ').setStyle(ButtonStyle.Secondary)
    );
    components.push(btnRow);

    await shopMsg.edit({ embeds: [shopEmbed], components }).catch(() => null);
    return true;
}

// 📌 1. Slash Commands Definition
const commands = [
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('ตั้งค่าและสร้างปุ่มส่งเรื่องร้องเรียน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-report')
        .setDescription('ตั้งค่าและสร้างปุ่มรายงานผู้กระทำผิด')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-admin')
        .setDescription('ตั้งค่าและสร้างปุ่มจัดการผู้ใช้ (สำหรับแอดมิน)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('setup-dot-role')
        .setDescription('ตั้งค่าห้องและยศสำหรับระบบพิมพ์จุด (.) รับยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องที่ต้องการให้พิมพ์จุด').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่จะให้เมื่อพิมพ์จุด').setRequired(true))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ใส่ลิงก์รูปภาพ Banner ใน Embed').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX เช่น #2ECC71').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-boost')
        .setDescription('ตั้งค่าระบบขอบคุณคน Boost')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องขอบคุณคน Boost').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('ข้อความ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('content_message').setDescription('ข้อความนอก Embed').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูปภาพ Banner').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-boost')
        .setDescription('ทดสอบส่งข้อความแจ้งเตือน Boost จำลอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('ตั้งค่าระบบต้อนรับสมาชิกใหม่ (Welcome)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องต้อนรับ').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('ข้อความ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('content_message').setDescription('ข้อความนอก Embed').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูปภาพ Banner').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-welcome')
        .setDescription('ทดสอบส่งข้อความต้อนรับสมาชิกใหม่จำลอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup_buttons')
        .setDescription('เพิ่มปุ่มกดรับยศใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้อง').setRequired(true))
        .addStringOption(opt => opt.setName('message_id').setDescription('ID ข้อความเดิม').setRequired(true))
        .addRoleOption(opt => opt.setName('role1').setDescription('ยศที่ 1').setRequired(true))
        .addStringOption(opt => opt.setName('label1').setDescription('ข้อความบนปุ่ม 1').setRequired(true))
        .addStringOption(opt => opt.setName('style1').setDescription('สีปุ่ม 1').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(opt => opt.setName('emoji1').setDescription('Emoji ปุ่ม 1').setRequired(false))
        .addRoleOption(opt => opt.setName('role2').setDescription('ยศที่ 2').setRequired(false))
        .addStringOption(opt => opt.setName('label2').setDescription('ข้อความบนปุ่ม 2').setRequired(false))
        .addStringOption(opt => opt.setName('style2').setDescription('สีปุ่ม 2').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(opt => opt.setName('emoji2').setDescription('Emoji ปุ่ม 2').setRequired(false))
        .addRoleOption(opt => opt.setName('role3').setDescription('ยศที่ 3').setRequired(false))
        .addStringOption(opt => opt.setName('label3').setDescription('ข้อความบนปุ่ม 3').setRequired(false))
        .addStringOption(opt => opt.setName('style3').setDescription('สีปุ่ม 3').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(opt => opt.setName('emoji3').setDescription('Emoji ปุ่ม 3').setRequired(false))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูปภาพ Banner').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกยศแบบไม่จำกัดใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('message_id').setDescription('ID ของข้อความเดิมที่ต้องการใส่ Dropdown').setRequired(true))
        .addStringOption(opt => opt.setName('role_ids').setDescription('ใส่ ID ของยศ คั่นด้วยเครื่องหมายจุลภาค (เช่น 12345,67890)').setRequired(true))
        .addStringOption(opt => opt.setName('placeholder').setDescription('ข้อความตัวอย่างบน Dropdown').setRequired(false))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูปภาพ Banner').setRequired(false)),

    new SlashCommandBuilder()
        .setName('add-shop-item')
        .setDescription('เพิ่ม/แก้ไขยศขายในร้านค้า (สินค้าอัปเดตหน้าร้านทันที)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการวางขาย').setRequired(true))
        .addIntegerOption(opt => opt.setName('price').setDescription('กำหนดราคา (บาท)').setRequired(true))
        .addIntegerOption(opt => opt.setName('stock').setDescription('จำนวนคงเหลือในคลัง').setRequired(false))
        .addStringOption(opt => opt.setName('category').setDescription('จำแนกประเภท')
            .setRequired(false)
            .addChoices(
                { name: '🎨 ยศตกแต่ง', value: 'ยศตกแต่ง' },
                { name: '⭐ ยศอื่นๆ', value: 'ยศอื่นๆ' }
            ))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบายเพิ่มเติม').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop-logs')
        .setDescription('ตั้งค่าห้อง Logs, ชื่อบัญชีรับเงิน, Wallet, PromptPay และรูป QR Code')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('topup_log').setDescription('ห้องแจ้งเตือนประวัติเติมเงิน/แนบสลิป').setRequired(true))
        .addChannelOption(opt => opt.setName('shop_log').setDescription('ห้องแจ้งเตือนประวัติซื้อขายยศ').setRequired(true))
        .addStringOption(opt => opt.setName('account_name').setDescription('ชื่อบัญชีผู้รับเงิน').setRequired(false))
        .addStringOption(opt => opt.setName('truewallet').setDescription('เบอร์ TrueMoney Wallet').setRequired(false))
        .addStringOption(opt => opt.setName('promptpay').setDescription('เบอร์ พร้อมเพย์ / เลขบัญชีธนาคาร').setRequired(false))
        .addStringOption(opt => opt.setName('qr_code_url').setDescription('ลิงก์รูปภาพ QR Code พร้อมเพย์').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop')
        .setDescription('ตั้งค่าและส่งหน้าร้านค้าขายยศไปยังห้องที่ระบุ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องที่ต้องการส่งหน้าร้านค้า').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed หน้าร้านค้า').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบายหน้าร้านค้า').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์ Banner รูปภาพ').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-admin-give-money')
        .setDescription('สร้างปุ่มแผงควบคุมเสกเงินลงในห้องแอดมิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องแอดมินสำหรับวางปุ่มเสกเงิน').setRequired(true))
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

client.on('ready', async () => {
    console.log(`🚀 บอทออนไลน์แล้ว: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อย!');
    } catch (error) {
        console.error('❌ Error Commands:', error);
    }
});

function createSetupModal(customId, title, defaultTitle, defaultDesc, defaultBtn) {
    const modal = new ModalBuilder().setCustomId(customId).setTitle(title);
    
    const titleInput = new TextInputBuilder().setCustomId('cfg_title').setLabel('1. หัวข้อ Embed (Title)').setValue(defaultTitle).setStyle(TextInputStyle.Short).setRequired(true);
    const descInput = new TextInputBuilder().setCustomId('cfg_desc').setLabel('2. รายละเอียด (Description)').setValue(defaultDesc).setStyle(TextInputStyle.Paragraph).setRequired(true);
    const btnInput = new TextInputBuilder().setCustomId('cfg_btn_label').setLabel('3. ข้อความบนปุ่ม').setValue(defaultBtn).setStyle(TextInputStyle.Short).setRequired(true);
    const imgInput = new TextInputBuilder().setCustomId('cfg_image_url').setLabel('4. ลิงก์รูป Banner (เว้นว่างได้)').setStyle(TextInputStyle.Short).setRequired(false);

    modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(descInput),
        new ActionRowBuilder().addComponents(btnInput),
        new ActionRowBuilder().addComponents(imgInput)
    );
    return modal;
}

// 📌 2. Interaction Listener
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {

            if (interaction.commandName === 'setup-dot-role') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');
                const targetRole = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#2ECC71';

                client.dotRoleConfigs.set(targetChannel.id, {
                    roleId: targetRole.id,
                    bannerUrl: (bannerUrl && bannerUrl !== '-') ? bannerUrl : null,
                    color: colorHex
                });

                const embed = new EmbedBuilder()
                    .setTitle('⚙️ ตั้งค่าระบบพิมพ์จุดรับยศสำเร็จ!')
                    .setColor(0x2ECC71)
                    .setDescription(`ตั้งค่าการรับยศ **${targetRole.name}** ในห้อง <#${targetChannel.id}> เรียบร้อยครับ!`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (interaction.commandName === 'setup-boost') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🚀 ขอบคุณสำหรับการ Server Boost!';
                const description = interaction.options.getString('description') || '💖 ขอบคุณคุณ {user} มากๆ นะครับที่ช่วยสนับสนุนเซิร์ฟเวอร์ **{guild}**!';
                const contentMessage = interaction.options.getString('content_message') || '🎉 **NEW BOOST!** ขอบคุณ {user} มากๆ ครับ!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#F47FFF';

                client.boostConfigs.set(interaction.guild.id, {
                    channelId: targetChannel.id, title, description, contentMessage, bannerUrl, color
                });

                return await interaction.editReply({ content: `✅ ตั้งค่าระบบ Boost ไว้ที่ห้อง <#${targetChannel.id}> เรียบร้อยครับ!` });
            }

            if (interaction.commandName === 'test-boost') {
                await interaction.deferReply({ ephemeral: true });
                const boostConfig = client.boostConfigs.get(interaction.guild.id) || {
                    channelId: interaction.channel.id,
                    title: '🚀 ขอบคุณสำหรับการ Server Boost!',
                    description: '💖 ขอบคุณคุณ {user} มากๆ นะครับที่ช่วยสนับสนุนเซิร์ฟเวอร์ **{guild}**!',
                    contentMessage: '🎉 **TEST BOOST!** ขอบคุณ {user} มากๆ ครับ!',
                    bannerUrl: null, color: '#F47FFF'
                };

                const targetChan = interaction.guild.channels.cache.get(boostConfig.channelId) || interaction.channel;
                const testEmbed = new EmbedBuilder()
                    .setTitle(parseCustomTags(boostConfig.title, interaction.guild, interaction.member))
                    .setColor(boostConfig.color || '#F47FFF')
                    .setDescription(parseCustomTags(boostConfig.description, interaction.guild, interaction.member))
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (boostConfig.bannerUrl) testEmbed.setImage(boostConfig.bannerUrl);

                await targetChan.send({ content: parseCustomTags(boostConfig.contentMessage, interaction.guild, interaction.member), embeds: [testEmbed] }).catch(() => null);
                return await interaction.editReply({ content: `✅ ส่งข้อความทดสอบไปที่ห้อง <#${targetChan.id}> เรียบร้อย!` });
            }

            if (interaction.commandName === 'setup-welcome') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🎉 ยินดีต้อนรับสู่ {guild}!';
                const description = interaction.options.getString('description') || '👋 ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ **{guild}** ครับ!';
                const contentMessage = interaction.options.getString('content_message') || '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#5865F2';

                client.welcomeConfigs.set(interaction.guild.id, {
                    channelId: targetChannel.id, title, description, contentMessage, bannerUrl, color
                });

                return await interaction.editReply({ content: `✅ ตั้งค่าระบบต้อนรับไว้ที่ห้อง <#${targetChannel.id}> เรียบร้อยครับ!` });
            }

            if (interaction.commandName === 'test-welcome') {
                await interaction.deferReply({ ephemeral: true });
                const welcomeConfig = client.welcomeConfigs.get(interaction.guild.id) || {
                    channelId: interaction.channel.id,
                    title: '🎉 ยินดีต้อนรับสู่ {guild}!',
                    description: '👋 ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ **{guild}** ครับ!',
                    contentMessage: '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!';
                    bannerUrl: null, color: '#5865F2'
                };

                const targetChan = interaction.guild.channels.cache.get(welcomeConfig.channelId) || interaction.channel;
                const testEmbed = new EmbedBuilder()
                    .setTitle(parseCustomTags(welcomeConfig.title, interaction.guild, interaction.member))
                    .setColor(welcomeConfig.color || '#5865F2')
                    .setDescription(parseCustomTags(welcomeConfig.description, interaction.guild, interaction.member))
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (welcomeConfig.bannerUrl) testEmbed.setImage(welcomeConfig.bannerUrl);

                await targetChan.send({ content: parseCustomTags(welcomeConfig.contentMessage, interaction.guild, interaction.member), embeds: [testEmbed] }).catch(() => null);
                return await interaction.editReply({ content: `✅ ส่งข้อความทดสอบไปที่ห้อง <#${targetChan.id}> เรียบร้อย!` });
            }

            if (interaction.commandName === 'setup_buttons') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');
                const messageId = interaction.options.getString('message_id').trim();
                const imageUrl = interaction.options.getString('image_url')?.trim();

                let targetMessage = await targetChannel.messages.fetch(messageId).catch(() => null);
                if (!targetMessage) return await interaction.editReply({ content: '❌ ไม่พบข้อความ ID ดังกล่าว' });

                const row = new ActionRowBuilder();
                let buttonCount = 0;
                const styleMap = { 'Primary': ButtonStyle.Primary, 'Secondary': ButtonStyle.Secondary, 'Success': ButtonStyle.Success, 'Danger': ButtonStyle.Danger };

                for (let i = 1; i <= 3; i++) {
                    const role = interaction.options.getRole(`role${i}`);
                    const label = interaction.options.getString(`label${i}`);
                    const styleStr = interaction.options.getString(`style${i}`) || 'Primary';
                    const emoji = interaction.options.getString(`emoji${i}`);

                    if (role && label) {
                        const btn = new ButtonBuilder().setCustomId(`btn_toggle_role_${role.id}`).setLabel(label).setStyle(styleMap[styleStr]);
                        if (emoji) btn.setEmoji(emoji);
                        row.addComponents(btn);
                        buttonCount++;
                    }
                }

                let embedsToUse = [...(targetMessage.embeds || [])];
                if (imageUrl && imageUrl.startsWith('http')) {
                    const newEmbed = embedsToUse.length > 0 ? EmbedBuilder.from(embedsToUse[0]).setImage(imageUrl) : new EmbedBuilder().setImage(imageUrl);
                    embedsToUse[0] = newEmbed;
                }

                if (targetMessage.author.id === client.user.id) {
                    await targetMessage.edit({ embeds: embedsToUse, components: [row] });
                } else {
                    await targetChannel.send({ content: targetMessage.content || null, embeds: embedsToUse, components: [row] });
                }

                return await interaction.editReply({ content: `✅ เพิ่มปุ่มรับยศ ${buttonCount} ปุ่มเรียบร้อยแล้ว!` });
            }

            if (interaction.commandName === 'setup-ticket') {
                return await interaction.showModal(createSetupModal('modal_config_ticket', '⚙️ ตั้งค่าระบบส่งเรื่องร้องเรียน', '📝 แจ้งปัญหาและส่งเรื่องร้องเรียน', 'กดปุ่มด้านล่างเพื่อส่งเรื่องร้องเรียน', 'ส่งเรื่องร้องเรียน'));
            }

            if (interaction.commandName === 'setup-report') {
                return await interaction.showModal(createSetupModal('modal_config_report', '⚙️ ตั้งค่าระบบรายงานผู้กระทำผิด', '⚠️ รายงานผู้กระทำผิด', 'กดปุ่มด้านล่างเพื่อแจ้งทีมงาน', 'รายงานผู้กระทำผิด'));
            }

            if (interaction.commandName === 'setup-admin') {
                return await interaction.showModal(createSetupModal('modal_config_admin', '⚙️ ตั้งค่าแผงควบคุมแอดมิน', '🛠️ แผงควบคุมระบบจัดการผู้ใช้', 'กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์ม', 'จัดการผู้ใช้'));
            }

            if (interaction.commandName === 'setup_dropdown') {
                await interaction.deferReply({ ephemeral: true });

                const messageId = interaction.options.getString('message_id').trim();
                const rawRoleIds = interaction.options.getString('role_ids').split(',').map(id => id.trim()).filter(id => id.length > 0);
                const placeholder = interaction.options.getString('placeholder') || '▼ เลือกยศของคุณที่นี่';
                const imageUrl = interaction.options.getString('image_url')?.trim();

                let targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (!targetMessage) return await interaction.editReply({ content: '❌ หาข้อความไม่พบ! กรุณาตรวจสอบ ID ข้อความอีกครั้ง' });

                const validRoles = [];
                for (const id of rawRoleIds) {
                    const role = interaction.guild.roles.cache.get(id);
                    if (role) validRoles.push(role);
                }

                if (validRoles.length === 0) return await interaction.editReply({ content: '❌ ไม่พบยศที่ระบุในเซิร์ฟเวอร์' });

                const roleChunks = [];
                for (let i = 0; i < validRoles.length; i += 25) {
                    roleChunks.push(validRoles.slice(i, i + 25));
                }

                if (roleChunks.length > 5) return await interaction.editReply({ content: '⚠️ Discord อนุญาตให้ใส่ Dropdown ได้สูงสุด 5 แถวต่อ 1 ข้อความครับ' });

                const actionRows = [];
                roleChunks.forEach((chunk, index) => {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_unlimited_roles_${index}`)
                        .setPlaceholder(roleChunks.length > 1 ? `${placeholder} (ชุดที่ ${index + 1})` : placeholder)
                        .setMinValues(0)
                        .setMaxValues(chunk.length)
                        .addOptions(chunk.map(role => new StringSelectMenuOptionBuilder().setLabel(role.name).setValue(role.id)));

                    actionRows.push(new ActionRowBuilder().addComponents(selectMenu));
                });

                let embedsToUse = [...(targetMessage.embeds || [])];
                if (imageUrl && imageUrl.startsWith('http')) {
                    const newEmbed = embedsToUse.length > 0 ? EmbedBuilder.from(embedsToUse[0]).setImage(imageUrl) : new EmbedBuilder().setImage(imageUrl);
                    embedsToUse[0] = newEmbed;
                }

                if (targetMessage.author.id === client.user.id) {
                    await targetMessage.edit({ embeds: embedsToUse, components: actionRows });
                } else {
                    await targetMessage.channel.send({ content: targetMessage.content || null, embeds: embedsToUse, components: actionRows });
                }

                return await interaction.editReply({ content: `✅ อัปเดต Dropdown เลือกยศรวม **${validRoles.length}** ยศ เรียบร้อย!` });
            }

            if (interaction.commandName === 'add-shop-item') {
                await interaction.deferReply({ ephemeral: true });
                const role = interaction.options.getRole('role');
                const price = interaction.options.getInteger('price');
                const description = interaction.options.getString('description') || 'ไม่มีรายละเอียดเพิ่มเติม';
                const category = interaction.options.getString('category') || 'ยศอื่นๆ';
                const stock = interaction.options.getInteger('stock') || 9999;

                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const existingIndex = guildItems.findIndex(i => i.roleId === role.id);

                if (existingIndex >= 0) {
                    guildItems[existingIndex] = { roleId: role.id, price, description, category, stock };
                } else {
                    guildItems.push({ roleId: role.id, price, description, category, stock });
                }

                client.shopItems.set(interaction.guild.id, guildItems);
                const isUpdated = await updateShopDisplay(interaction.guild);

                return await interaction.editReply({ 
                    content: `✅ เพิ่ม/แก้ไขยศ **${role.name}** (ราคา ${price} บาท, ประเภท: ${category}, คงเหลือ: ${stock} ชิ้น) สำเร็จ!` + 
                             (isUpdated ? `\n⚡ **อัปเดตข้อมูลไปยังหน้าร้านค้าเรียลไทม์เรียบร้อยแล้ว!**` : `\n💡 *(ใช้คำสั่ง \`/setup-shop\` เพื่อสร้างหน้าร้านได้เลย)*`)
                });
            }

            if (interaction.commandName === 'setup-shop-logs') {
                await interaction.deferReply({ ephemeral: true });
                const topupLog = interaction.options.getChannel('topup_log');
                const shopLog = interaction.options.getChannel('shop_log');
                const accountName = interaction.options.getString('account_name') || 'ไม่ระบุชื่อบัญชี';
                const truewallet = interaction.options.getString('truewallet') || 'ไม่ระบุ';
                const promptpay = interaction.options.getString('promptpay') || 'ไม่ระบุ';
                const qrCodeUrl = interaction.options.getString('qr_code_url') || null;

                client.shopLogsConfig.set(interaction.guild.id, {
                    topupLogId: topupLog.id,
                    shopLogId: shopLog.id,
                    accountName,
                    truewallet,
                    promptpay,
                    qrCodeUrl
                });

                return await interaction.editReply({ 
                    content: `✅ **ตั้งค่าระบบรับเงินและบันทึก Logs สำเร็จ!**\n\n` +
                             `• **ชื่อบัญชีรับเงิน:** \`${accountName}\`\n` +
                             `• **TrueMoney Wallet:** \`${truewallet}\`\n` +
                             `• **PromptPay / เลขบัญชี:** \`${promptpay}\`\n` +
                             `• **ห้อง Log เติมเงิน:** <#${topupLog.id}>\n` +
                             `• **ห้อง Log ซื้อขาย:** <#${shopLog.id}>` 
                });
            }

            if (interaction.commandName === 'setup-shop') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                if (!targetChannel || !targetChannel.isTextBased()) {
                    return await interaction.editReply({ content: '❌ ห้องที่เลือกไม่ใช่ห้องข้อความ กรุณาเลือกห้องใหม่อีกครั้ง' });
                }

                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'ยินดีต้อนรับคุณ {user} เลือกซื้อยศที่ต้องการ หรือกดปุ่มเติมเงินด้านล่างเพื่อสะสมเครดิต!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#F1C40F';

                const sentMsg = await targetChannel.send({ content: '⏳ กำลังสร้างหน้าร้านค้า...' }).catch(() => null);

                if (sentMsg) {
                    client.shopMessageConfigs.set(interaction.guild.id, {
                        channelId: targetChannel.id,
                        messageId: sentMsg.id,
                        title, description, bannerUrl, color
                    });

                    await updateShopDisplay(interaction.guild);
                }

                return await interaction.editReply({ content: `✅ ส่งข้อความหน้าร้านค้าไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!` });
            }

            if (interaction.commandName === 'setup-admin-give-money') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');

                if (!targetChannel || !targetChannel.isTextBased()) {
                    return await interaction.editReply({ content: '❌ กรุณาเลือกห้องข้อความที่ถูกต้อง' });
                }

                const adminEmbed = new EmbedBuilder()
                    .setTitle('🪄 แผงควบคุมเสกเงิน (Admin Balance Controller)')
                    .setColor(0x9B59B6)
                    .setDescription('กดปุ่มด้านล่างเพื่อเพิ่มยอดเงินให้สมาชิกคนใดก็ได้ในเซิร์ฟเวอร์')
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('btn_admin_give_money')
                        .setLabel('🪄 เสกเงิน / เพิ่มเครดิต')
                        .setStyle(ButtonStyle.Danger)
                );

                await targetChannel.send({ embeds: [adminEmbed], components: [btnRow] });
                return await interaction.editReply({ content: `✅ สร้างปุ่มแผงเสกเงินในห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!` });
            }
        }

        // --- BUTTON HANDLERS ---
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('btn_toggle_role_')) {
                await interaction.deferReply({ ephemeral: true });
                const roleId = interaction.customId.replace('btn_toggle_role_', '');
                const role = interaction.guild.roles.cache.get(roleId);
                const member = interaction.member;

                if (!role) return await interaction.editReply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์' });

                if (member.roles.cache.has(role.id)) {
                    await member.roles.remove(role);
                    return await interaction.editReply({ content: `🔴 ถอดยศ **${role.name}** ออกเรียบร้อยแล้ว!` });
                } else {
                    await member.roles.add(role);
                    return await interaction.editReply({ content: `✅ เพิ่มยศ **${role.name}** ให้คุณเรียบร้อยแล้ว!` });
                }
            }

            if (interaction.customId === 'btn_check_balance') {
                const bal = client.userBalances.get(interaction.user.id) || 0;
                return await interaction.reply({ content: `💰 ยอดเงินคงเหลือของคุณคือ **${bal}** บาท`, ephemeral: true });
            }

            if (interaction.customId === 'btn_admin_give_money') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานปุ่มนี้ (สำหรับ Administrator เท่านั้น)', ephemeral: true });
                }

                const modal = new ModalBuilder().setCustomId('modal_admin_give_money').setTitle('🪄 ระบบเสกเงิน/เพิ่มเครดิต');
                
                const userIdInput = new TextInputBuilder()
                    .setCustomId('input_target_user_id')
                    .setLabel('User ID ของผู้รับเงิน')
                    .setPlaceholder('เช่น 123456789012345678')
                    .setValue(interaction.user.id) 
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const amountInput = new TextInputBuilder()
                    .setCustomId('input_give_amount')
                    .setLabel('จำนวนเงินที่ต้องการเสก (บาท)')
                    .setPlaceholder('เช่น 1000')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userIdInput),
                    new ActionRowBuilder().addComponents(amountInput)
                );

                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_truemoney') {
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                const accName = logsCfg?.accountName || 'ไม่ระบุชื่อบัญชี';
                const twNo = logsCfg?.truewallet || 'ไม่ระบุ';

                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงิน TrueMoney Wallet');
                const voucherInput = new TextInputBuilder()
                    .setCustomId('input_voucher_url')
                    .setLabel(`ชื่อบัญชี: ${accName} | เบอร์: ${twNo}`)
                    .setPlaceholder('วางลิงก์ซองของขวัญ https://gift.truemoney.com/v2/verify?v=...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(voucherInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_promptpay') {
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                const accName = logsCfg?.accountName || 'กรุณาสอบถามแอดมิน';
                const ppNo = logsCfg?.promptpay || 'กรุณาสอบถามแอดมิน';
                const qrUrl = logsCfg?.qrCodeUrl || null;

                const ppEmbed = new EmbedBuilder()
                    .setTitle('📲 เติมเงินผ่าน PromptPay / QR Code')
                    .setColor(0x3498DB)
                    .setDescription(`👤 **ชื่อบัญชีรับเงิน:** \`${accName}\`\n💳 **เลขบัญชี / พร้อมเพย์:** \`${ppNo}\`\n\n📌 **วิธีเติมเงิน:**\n1. โอนเงินหรือสแกน QR Code ตามจำนวนที่ต้องการ\n2. โอนเสร็จแล้ว ให้แจ้งทีมงานเพื่อตรวจสอบยอดครับ`)
                    .setTimestamp();

                if (qrUrl && qrUrl.startsWith('http')) ppEmbed.setImage(qrUrl);

                return await interaction.reply({ embeds: [ppEmbed], ephemeral: true });
            }
        }

        // --- SELECT MENU HANDLERS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_buy_shop_role') {
                await interaction.deferReply({ ephemeral: true });

                const selectedRoleId = interaction.values[0];
                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const itemIndex = guildItems.findIndex(i => i.roleId === selectedRoleId);

                if (itemIndex === -1) {
                    return await interaction.editReply({ content: '❌ ไม่พบสินค้ายศนี้ในร้านค้าแล้ว' });
                }

                const item = guildItems[itemIndex];
                const userBalance = client.userBalances.get(interaction.user.id) || 0;

                if (userBalance < item.price) {
                    return await interaction.editReply({ content: `❌ **ยอดเงินของคุณไม่พอ!** ยศนี้ราคา **${item.price}** บาท แตียอดเงินของคุณมี **${userBalance}** บาท (กรุณาเติมเงินก่อนสั่งซื้อ)` });
                }

                if (item.stock <= 0) {
                    return await interaction.editReply({ content: '❌ สินค้ายศนี้หมดแล้ว ไม่สามารถสั่งซื้อเพิ่มได้' });
                }

                const targetRole = interaction.guild.roles.cache.get(item.roleId);
                if (!targetRole) {
                    return await interaction.editReply({ content: '❌ ยศนี้ถูกลบไปจากเซิร์ฟเวอร์แล้ว กรุณาติดต่อแอดมิน' });
                }

                // ตัดเงิน & หักสต็อก
                client.userBalances.set(interaction.user.id, userBalance - item.price);
                guildItems[itemIndex].stock -= 1;
                client.shopItems.set(interaction.guild.id, guildItems);

                // เพิ่มยศให้ผู้ใช้
                await interaction.member.roles.add(targetRole).catch(() => null);

                // อัปเดตหน้าร้านค้า
                await updateShopDisplay(interaction.guild);

                // ส่ง Log ไปห้อง Shop Logs
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                if (logsCfg && logsCfg.shopLogId) {
                    const shopLogChannel = interaction.guild.channels.cache.get(logsCfg.shopLogId);
                    if (shopLogChannel && shopLogChannel.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🛒 บันทึกการซื้อขายยศสำเร็จ')
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: '👤 ผู้ซื้อ', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                                { name: '🏷️ ยศที่ซื้อ', value: `${targetRole.name}`, inline: true },
                                { name: '📁 ประเภท', value: `${item.category}`, inline: true },
                                { name: '💰 ราคา', value: `${item.price} บาท`, inline: true },
                                { name: '💳 ยอดเงินคงเหลือ', value: `${userBalance - item.price} บาท`, inline: true },
                                { name: '📦 จำนวนในคลังคงเหลือ', value: `${item.stock} ชิ้น`, inline: true }
                            )
                            .setTimestamp();
                        shopLogChannel.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                return await interaction.editReply({ content: `🎉 **สั่งซื้อสำเร็จ!** คุณได้รับยศ **${targetRole.name}** เรียบร้อยแล้ว (หักเงิน ${item.price} บาท, ยอดเงินคงเหลือ: ${userBalance - item.price} บาท)` });
            }
        }

        // --- MODAL HANDLERS ---
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_admin_give_money') {
                await interaction.deferReply({ ephemeral: true });

                const targetUserId = interaction.fields.getTextInputValue('input_target_user_id').trim();
                const amountStr = interaction.fields.getTextInputValue('input_give_amount').trim();
                const amount = parseInt(amountStr, 10);

                if (isNaN(amount) || amount <= 0) {
                    return await interaction.editReply({ content: '❌ กรุณากรอกจำนวนเงินเป็นตัวเลขที่มากกว่า 0' });
                }

                const currentBal = client.userBalances.get(targetUserId) || 0;
                const newBal = currentBal + amount;
                client.userBalances.set(targetUserId, newBal);

                return await interaction.editReply({ content: `🪄 **เสกเงินสำเร็จ!** เพิ่มเงินจำนวน **${amount}** บาท ให้กับผู้ใช้ <@${targetUserId}> เรียบร้อยแล้ว (ยอดเงินรวมเป็น: **${newBal}** บาท)` });
            }

            if (interaction.customId === 'modal_topup_truemoney') {
                await interaction.deferReply({ ephemeral: true });
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_url').trim();

                return await interaction.editReply({ content: `📩 **รับข้อมูลลิงก์ซองของขวัญเรียบร้อยแล้ว!**\nระบบกำลังส่งข้อมูลลิงก์ \`${voucherUrl}\` ให้แอดมินตรวจสอบยอดเงินครับ` });
            }
        }
    } catch (err) {
        console.error('Error in interaction:', err);
    }
});

// 📌 3. Message Listener (สำหรับพิมพ์จุด . รับยศ)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const dotConfig = client.dotRoleConfigs.get(message.channel.id);
    if (dotConfig && message.content.trim() === '.') {
        const role = message.guild.roles.cache.get(dotConfig.roleId);
        if (!role) return;

        try {
            await message.member.roles.add(role);
            
            const successEmbed = new EmbedBuilder()
                .setTitle('✅ รับยศสำเร็จ!')
                .setColor(dotConfig.color || '#2ECC71')
                .setDescription(`ยินดีด้วยครับ <@${message.author.id}> คุณได้รับยศ **${role.name}** เรียบร้อยแล้ว!`)
                .setTimestamp();

            if (dotConfig.bannerUrl) successEmbed.setImage(dotConfig.bannerUrl);

            await message.channel.send({ embeds: [successEmbed] });
        } catch (err) {
            console.error('ไม่สามารถแจกยศได้:', err);
        }
    }
});

client.login(TOKEN);
