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
client.userBalances = client.userBalances || new Map();     // เก็บยอดเงินสมาชิก { userId: balance }
client.shopItems = client.shopItems || new Map();           // เก็บสินค้ายศ { guildId: [{ roleId, price, description }] }
client.shopLogsConfig = client.shopLogsConfig || new Map(); // เก็บห้อง Logs { topupLogId, shopLogId, promptpayInfo }

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

// 📌 1. Slash Commands Definition
const commands = [
    // --- ระบบเดิม ---
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

    // --- ระบบ Dropdown เลือกยศไม่จำกัด ---
    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกยศแบบไม่จำกัดใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(opt => opt.setName('message_id').setDescription('ID ของข้อความเดิมที่ต้องการใส่ Dropdown').setRequired(true))
        .addStringOption(opt => opt.setName('role_ids').setDescription('ใส่ ID ของยศ คั่นด้วยเครื่องหมายจุลภาค (เช่น 12345,67890)').setRequired(true))
        .addStringOption(opt => opt.setName('placeholder').setDescription('ข้อความตัวอย่างบน Dropdown').setRequired(false))
        .addStringOption(opt => opt.setName('image_url').setDescription('ลิงก์รูปภาพ Banner').setRequired(false)),

    // --- ระบบร้านค้าขายยศ & เติมเงิน ---
    new SlashCommandBuilder()
        .setName('add-shop-item')
        .setDescription('เพิ่ม/แก้ไขยศขายในร้านค้า (ใส่ราคาและคำอธิบายเองได้)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศที่ต้องการวางขาย').setRequired(true))
        .addIntegerOption(opt => opt.setName('price').setDescription('กำหนดราคา (บาท)').setRequired(true))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบายเพิ่มเติมเกี่ยวกับยศนี้').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop-logs')
        .setDescription('ตั้งค่าห้องประวัติการเติมเงิน/ซื้อขาย และเบอร์ PromptPay')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('topup_log').setDescription('ห้องแจ้งเตือนประวัติเติมเงิน/แนบสลิป').setRequired(true))
        .addChannelOption(opt => opt.setName('shop_log').setDescription('ห้องแจ้งเตือนประวัติซื้อขายยศ').setRequired(true))
        .addStringOption(opt => opt.setName('promptpay').setDescription('เบอร์ พร้อมเพย์ / เลขบัญชี สำหรับรับโอนเงิน').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop')
        .setDescription('ตั้งค่าและส่งหน้าร้านค้าขายยศไปยังห้องที่ระบุ ID')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้อง หรือพิมพ์ระบุ ID ห้องที่ต้องการส่งหน้าร้านค้า').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed หน้าร้านค้า').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบายหน้าร้านค้า (รองรับแท็ก {user})').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์ Banner รูปภาพ').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX เช่น #F1C40F').setRequired(false))
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

// Helper สร้าง Modal
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
                    contentMessage: '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!',
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
                return await interaction.showModal(createSetupModal('modal_config_report', '⚙️ ตั้งค่าระบบรายงานผู้ทำผิด', '⚠️ รายงานผู้กระทำผิด', 'กดปุ่มด้านล่างเพื่อแจ้งทีมงาน', 'รายงานผู้กระทำผิด'));
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

                if (roleChunks.length > 5) return await interaction.editReply({ content: '⚠️ Discord อนุญาตให้ใส่ Dropdown ได้สูงสุด 5 แถว (125 ยศ) ต่อ 1 ข้อความครับ' });

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

            // --- 🛒 ระบบร้านค้าขายยศ & เติมเงิน ---
            if (interaction.commandName === 'add-shop-item') {
                await interaction.deferReply({ ephemeral: true });
                const role = interaction.options.getRole('role');
                const price = interaction.options.getInteger('price');
                const description = interaction.options.getString('description') || 'ไม่มีรายละเอียดเพิ่มเติม';

                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const existingIndex = guildItems.findIndex(i => i.roleId === role.id);

                if (existingIndex >= 0) {
                    guildItems[existingIndex] = { roleId: role.id, price, description };
                } else {
                    guildItems.push({ roleId: role.id, price, description });
                }

                client.shopItems.set(interaction.guild.id, guildItems);
                return await interaction.editReply({ content: `✅ บันทึกยศ **${role.name}** ราคา **${price} บาท** เข้าสู่รายการร้านค้าเรียบร้อยแล้ว!\n💡 *หมายเหตุ: แอดมินสามารถใช้ `/setup-shop` เพื่อส่ง/อัปเดตหน้าร้านค้าลงในห้องที่ต้องการได้เลย*` });
            }

            if (interaction.commandName === 'setup-shop-logs') {
                await interaction.deferReply({ ephemeral: true });
                const topupLog = interaction.options.getChannel('topup_log');
                const shopLog = interaction.options.getChannel('shop_log');
                const promptpay = interaction.options.getString('promptpay') || 'ไม่ระบุ';

                client.shopLogsConfig.set(interaction.guild.id, {
                    topupLogId: topupLog.id,
                    shopLogId: shopLog.id,
                    promptpay
                });

                return await interaction.editReply({ content: `✅ ตั้งค่าห้อง Log เติมเงิน (<#${topupLog.id}>) และ Log ซื้อขาย (<#${shopLog.id}>) เรียบร้อยแล้ว!` });
            }

            if (interaction.commandName === 'setup-shop') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                if (!targetChannel || !targetChannel.isTextBased()) {
                    return await interaction.editReply({ content: '❌ ห้องที่เลือกไม่ใช่ห้องข้อความ กรุณาตรวจสอบ ID ห้องใหม่อีกครั้ง' });
                }

                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'ยินดีต้อนรับคุณ {user} เลือกซื้อยศที่ต้องการ หรือกดปุ่มเติมเงินด้านล่างเพื่อสะสมเครดิต!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#F1C40F';

                // 🔄 ดึงรายการยศทั้งหมดที่มีการใส่ไว้ในระบบมาสร้างหน้าร้านค้าอัตโนมัติ
                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                
                const shopEmbed = new EmbedBuilder()
                    .setTitle(parseCustomTags(title, interaction.guild, interaction.member))
                    .setColor(color)
                    .setDescription(parseCustomTags(description, interaction.guild, interaction.member))
                    .setTimestamp();

                if (bannerUrl && bannerUrl.startsWith('http')) shopEmbed.setImage(bannerUrl);

                let itemText = '';
                const shopSelect = new StringSelectMenuBuilder()
                    .setCustomId('select_buy_shop_role')
                    .setPlaceholder('🛒 เลือกยศที่คุณต้องการซื้อที่นี่...');

                let validItemCount = 0;

                if (guildItems.length > 0) {
                    guildItems.forEach((item, idx) => {
                        const roleObj = interaction.guild.roles.cache.get(item.roleId);
                        if (roleObj) {
                            validItemCount++;
                            itemText += `**${validItemCount}. <@&${item.roleId}>** — 💰 **${item.price}** บาท\n> 📝 ${item.description}\n\n`;
                            
                            shopSelect.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(`${roleObj.name} (${item.price} บาท)`)
                                    .setValue(item.roleId)
                                    .setDescription(item.description.slice(0, 50))
                            );
                        }
                    });
                }

                if (validItemCount === 0) {
                    itemText = '⚠️ ยังไม่มีรายการยศในระบบ (แอดมินต้องใช้ `/add-shop-item` เพื่อใส่ยศเข้าในร้านค้าก่อน)';
                }

                shopEmbed.addFields({ name: '📜 รายการยศที่มีจำหน่ายอัตโนมัติ', value: itemText });

                const components = [];

                // แสดง Dropdown เลือกซื้อยศเฉพาะเมื่อมียศในร้านค้า
                if (validItemCount > 0) {
                    components.push(new ActionRowBuilder().addComponents(shopSelect));
                }

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_topup_truemoney').setLabel('🧧 เติมเงิน TrueMoney').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_topup_promptpay').setLabel('📲 เติมเงิน PromptPay / QR Code').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_check_balance').setLabel('💰 เช็กยอดเงินคงเหลือ').setStyle(ButtonStyle.Secondary)
                );
                components.push(btnRow);

                await targetChannel.send({ embeds: [shopEmbed], components }).catch(() => null);
                return await interaction.editReply({ content: `✅ ส่งข้อความหน้าร้านค้าที่มีรายการยศอัตโนมัติ (${validItemCount} รายการ) ไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!` });
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

            if (interaction.customId === 'btn_topup_truemoney') {
                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงินผ่าน TrueMoney Wallet');
                const voucherInput = new TextInputBuilder()
                    .setCustomId('input_voucher_url')
                    .setLabel('กรอกลิงก์ซองของขวัญ TrueMoney')
                    .setPlaceholder('https://gift.truemoney.com/v2/verify?v=...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(voucherInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_promptpay') {
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                const ppNo = logsCfg?.promptpay || 'กรุณาสอบถามแอดมิน';

                const ppEmbed = new EmbedBuilder()
                    .setTitle('📲 เติมเงินผ่าน PromptPay / QR Code')
                    .setColor(0x3498DB)
                    .setDescription(`**เลขบัญชี / พร้อมเพย์:** \`${ppNo}\`\n\n📌 **วิธีเติมเงิน:**\n1. โอนเงินตามจำนวนที่ต้องการ\n2. กดปุ่ม **"📩 แจ้งแนบสลิปการโอนเงิน"** ด้านล่างเพื่อส่งข้อมูลสลิป`)
                    .setFooter({ text: 'ระบบจะส่งข้อมูลการโอนไปให้แอดมินตรวจสอบครับ' });

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_notify_slip').setLabel('📩 แจ้งแนบสลิปการโอนเงิน').setStyle(ButtonStyle.Primary)
                );

                return await interaction.reply({ embeds: [ppEmbed], components: [btnRow], ephemeral: true });
            }

            if (interaction.customId === 'btn_notify_slip') {
                const modal = new ModalBuilder().setCustomId('modal_notify_slip').setTitle('📩 แจ้งแนบสลิปโอนเงิน');
                const amountInput = new TextInputBuilder().setCustomId('input_slip_amount').setLabel('จำนวนเงินที่โอน (บาท)').setStyle(TextInputStyle.Short).setRequired(true);
                const timeInput = new TextInputBuilder().setCustomId('input_slip_time').setLabel('เวลาที่โอนเงินในสลิป').setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(amountInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );
                return await interaction.showModal(modal);
            }

            // แอดมินกดอนุมัติสลิปเติมเงิน
            if (interaction.customId.startsWith('btn_approve_topup_')) {
                const [_, __, ___, targetUserId, amountStr] = interaction.customId.split('_');
                const amount = parseFloat(amountStr);

                const currentBal = client.userBalances.get(targetUserId) || 0;
                client.userBalances.set(targetUserId, currentBal + amount);

                await interaction.update({ content: `✅ **[อนุมัติเรียบร้อย]** เพิ่มเงินจำนวน **${amount}** บาท ให้ผู้ใช้ <@${targetUserId}> แล้ว!`, components: [] });

                const user = await client.users.fetch(targetUserId).catch(() => null);
                if (user) {
                    user.send(`🎉 ยอดเงินจำนวน **${amount}** บาท จากการเติมเงินของคุณได้รับการอนุมัติเรียบร้อยแล้ว! (ยอดคงเหลือ: **${currentBal + amount}** บาท)`).catch(() => null);
                }
            }

            // 🔴 ปุ่มยกเลิกสั่งซื้อยศ
            if (interaction.customId === 'btn_cancel_buy') {
                return await interaction.update({ content: '❌ ยกเลิกรายการสั่งซื้อเรียบร้อยแล้ว', embeds: [], components: [] });
            }

            // 🟢 ปุ่มยืนยันการสั่งซื้อยศ
            if (interaction.customId.startsWith('btn_confirm_buy_')) {
                await interaction.deferUpdate();

                const roleId = interaction.customId.replace('btn_confirm_buy_', '');
                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const item = guildItems.find(i => i.roleId === roleId);

                if (!item) {
                    return await interaction.editReply({ content: '❌ ไม่พบข้อมูลสินค้านี้', embeds: [], components: [] });
                }

                const userBal = client.userBalances.get(interaction.user.id) || 0;

                // เช็กเงินอีกครั้งก่อนตัด
                if (userBal < item.price) {
                    return await interaction.editReply({
                        content: `❌ **สั่งซื้อไม่สำเร็จ!** คุณมีเงินไม่พอสำหรับสั่งซื้อยศนี้ (ต้องการ **${item.price}** บาท แต่คุณมี **${userBal}** บาท)\n💡 *กรุณาเติมเงินก่อนทำการสั่งซื้อนะครับ*`,
                        embeds: [],
                        components: []
                    });
                }

                const roleObj = interaction.guild.roles.cache.get(roleId);
                if (!roleObj) {
                    return await interaction.editReply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์แล้ว', embeds: [], components: [] });
                }

                // 💰 ตัดเงิน + มอบยศให้อัตโนมัติ
                const newBalance = userBal - item.price;
                client.userBalances.set(interaction.user.id, newBalance);

                try {
                    await interaction.member.roles.add(roleObj);
                } catch (err) {
                    console.error('ไม่สามารถมอบยศได้:', err);
                    return await interaction.editReply({
                        content: '⚠️ ตัดเงินสำเร็จ แต่บอทไม่สามารถมอบยศให้ได้ (โปรดเช็กสิทธิ์และลำดับ Role ของบอท)',
                        embeds: [],
                        components: []
                    });
                }

                // 📢 บันทึกการซื้อขายลงห้อง Log ซื้อขาย
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                if (logsCfg?.shopLogId) {
                    const shopLogChan = interaction.guild.channels.cache.get(logsCfg.shopLogId);
                    if (shopLogChan && shopLogChan.isTextBased()) {
                        const logEmbed = new EmbedBuilder()
                            .setTitle('🎉 [บันทึกการซื้อขาย] ซื้อยศสำเร็จ!')
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: '👤 ผู้ซื้อ', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                                { name: '🎭 ยศที่ได้รับ', value: `<@&${roleObj.id}>`, inline: true },
                                { name: '💵 ราคา', value: `${item.price} บาท`, inline: true },
                                { name: '💰 ยอดเงินคงเหลือ', value: `${newBalance} บาท`, inline: true }
                            )
                            .setFooter({ text: `User ID: ${interaction.user.id}` })
                            .setTimestamp();

                        await shopLogChan.send({ embeds: [logEmbed] }).catch(() => null);
                    }
                }

                const successEmbed = new EmbedBuilder()
                    .setTitle('✅ สั่งซื้อและรับยศสำเร็จ!')
                    .setColor(0x2ECC71)
                    .setDescription(`คุณได้รับยศ **${roleObj.name}** เรียบร้อยแล้ว!\n\n• **ตัดเงิน:** \`${item.price}\` บาท\n• **คงเหลือ:** \`${newBalance}\` บาท`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [successEmbed], components: [] });
            }
        }

        // --- SELECT MENU HANDLERS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('select_unlimited_roles_')) {
                await interaction.deferReply({ ephemeral: true });
                const selectedRoleIds = interaction.values;
                const member = interaction.member;
                const allMenuRoleIds = interaction.component.options.map(opt => opt.value);

                for (const roleId of allMenuRoleIds) {
                    if (!selectedRoleIds.includes(roleId) && member.roles.cache.has(roleId)) {
                        await member.roles.remove(roleId).catch(() => null);
                    }
                }
                for (const roleId of selectedRoleIds) {
                    if (!member.roles.cache.has(roleId)) {
                        await member.roles.add(roleId).catch(() => null);
                    }
                }
                return await interaction.editReply({ content: '✅ อัปเดตยศของคุณเรียบร้อยแล้ว!' });
            }

            // 🛒 เลือกยศจาก Dropdown หน้าร้านค้า (เข้าขั้นตอนยืนยัน)
            if (interaction.customId === 'select_buy_shop_role') {
                await interaction.deferReply({ ephemeral: true });

                const selectedRoleId = interaction.values[0];
                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const item = guildItems.find(i => i.roleId === selectedRoleId);

                if (!item) return await interaction.editReply({ content: '❌ ไม่พบรายการสินค้านี้ในระบบร้านค้า' });

                const roleObj = interaction.guild.roles.cache.get(item.roleId);
                if (!roleObj) return await interaction.editReply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์' });

                const userBal = client.userBalances.get(interaction.user.id) || 0;

                const confirmEmbed = new EmbedBuilder()
                    .setTitle('🛒 ยืนยันการสั่งซื้อยศ')
                    .setColor(0xF1C40F)
                    .setDescription(`คุณกำลังจะทำการสั่งซื้อยศ **${roleObj.name}**\n\n` +
                        `• **ราคา:** \`${item.price}\` บาท\n` +
                        `• **ยอดเงินคงเหลือของคุณ:** \`${userBal}\` บาท\n\n` +
                        (userBal < item.price ? '⚠️ **ยอดเงินคงเหลือของคุณไม่พอสำหรับการสั่งซื้อนี้** (กรุณาเติมเงินก่อนกดยืนยัน)' : '✅ ยอดเงินของคุณเพียงพอสำหรับการสั่งซื้อ'))
                    .setTimestamp();

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`btn_confirm_buy_${roleObj.id}`)
                        .setLabel('🟢 ยืนยันการสั่งซื้อ')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('btn_cancel_buy')
                        .setLabel('🔴 ยกเลิก')
                        .setStyle(ButtonStyle.Danger)
                );

                return await interaction.editReply({ embeds: [confirmEmbed], components: [row] });
            }
        }

        // --- MODAL HANDLERS ---
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_topup_truemoney') {
                await interaction.deferReply({ ephemeral: true });
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_url').trim();
                return await interaction.editReply({ content: `📩 ระบบได้รับลิงก์ซองของขวัญเรียบร้อยแล้ว: \`${voucherUrl}\`\n*(กำลังส่งเรื่องให้ระบบประมวลผลเติมเงิน)*` });
            }

            if (interaction.customId === 'modal_notify_slip') {
                await interaction.deferReply({ ephemeral: true });
                const amount = interaction.fields.getTextInputValue('input_slip_amount');
                const time = interaction.fields.getTextInputValue('input_slip_time');

                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                if (!logsCfg?.topupLogId) {
                    return await interaction.editReply({ content: '❌ เซิร์ฟเวอร์นี้ยังไม่ได้ตั้งค่าห้อง Log เติมเงิน (แอดมินใช้ `/setup-shop-logs`) ' });
                }

                const topupChan = interaction.guild.channels.cache.get(logsCfg.topupLogId);
                if (topupChan) {
                    const notifyEmbed = new EmbedBuilder()
                        .setTitle('📩 มีการแจ้งเติมเงิน / แนบสลิปใหม่!')
                        .setColor(0xE67E22)
                        .addFields(
                            { name: '👤 ผู้แจ้ง', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '💵 จำนวนเงิน', value: `${amount} บาท`, inline: true },
                            { name: '⏰ เวลาโอน', value: time, inline: true }
                        )
                        .setFooter({ text: 'แอดมินกรุณาตรวจสอบสลิปแล้วกดปุ่มอนุมัติด้านล่าง' })
                        .setTimestamp();

                    const btnRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`btn_approve_topup_${interaction.user.id}_${amount}`)
                            .setLabel('✅ อนุมัติยอดเงินนี้')
                            .setStyle(ButtonStyle.Success)
                    );

                    await topupChan.send({ embeds: [notifyEmbed], components: [btnRow] });
                }

                return await interaction.editReply({ content: '✅ ส่งข้อมูลการโอนเงินให้แอดมินเรียบร้อยแล้วครับ!' });
            }
        }
    } catch (err) {
        console.error('Interaction Error:', err);
    }
});

// 📌 3. คำสั่ง Prefix: !botsetup และ !status
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.startsWith('!botsetup')) {
        const setupEmbed = new EmbedBuilder()
            .setTitle('🤖 คู่มือการตั้งค่าและคำสั่งทั้งหมดของบอท (Bot Setup Manual)')
            .setColor(0x5865F2)
            .setDescription('รวมคำสั่งสำหรับแอดมินในการตั้งค่าระบบต่างๆ ในเซิร์ฟเวอร์ด้วย **Slash Commands (`/`)** และ **Prefix Commands (`!`)**')
            .addFields(
                { 
                    name: '🛍️ ระบบร้านค้าขายยศ & เติมเงิน (Shop & Topup)', 
                    value: '• `/add-shop-item` : เพิ่ม/แก้ไข ยศที่ต้องการขาย ใส่ราคาและคำอธิบาย\n• `/setup-shop` : ส่งหน้าร้านค้าพร้อมดึงยศที่มีทั้งหมดมาโชว์อัตโนมัติ\n• `/setup-shop-logs` : ตั้งค่าห้อง Log เติมเงิน, Log ซื้อขาย และเบอร์ PromptPay' 
                },
                { 
                    name: '🎭 ระบบรับยศอัตโนมัติ (Role Systems)', 
                    value: '• `/setup_dropdown` : เพิ่ม Dropdown เลือกยศไม่จำกัด (ใส่ ID คั่นด้วย `,`)\n• `/setup_buttons` : เพิ่มปุ่มกดรับยศใส่ข้อความเดิม\n• `/setup-dot-role` : ตั้งค่าห้องพิมพ์จุด (`.`) เพื่อรับยศ' 
                },
                { 
                    name: '🎉 ระบบต้อนรับ & แจ้งเตือน (Welcome & Boost)', 
                    value: '• `/setup-welcome` : ตั้งค่าห้องและข้อความต้อนรับคนเข้าดิส\n• `/test-welcome` : ทดสอบการทำงานระบบต้อนรับ\n• `/setup-boost` : ตั้งค่าห้องขอบคุณคน Boost เซิร์ฟเวอร์\n• `/test-boost` : ทดสอบส่งข้อความแจ้งเตือน Boost' 
                },
                { 
                    name: '🎟️ ระบบ Ticket & แจ้งเรื่อง (Management)', 
                    value: '• `/setup-ticket` : สร้างปุ่มกดเปิดตั๋วร้องเรียน\n• `/setup-report` : สร้างปุ่มรายงานผู้กระทำผิด\n• `/setup-admin` : แผงควบคุมลงโทษ/จัดการผู้ใช้' 
                },
                { 
                    name: '📊 คำสั่งทั่วไป & จัดการเซิร์ฟเวอร์', 
                    value: '• `!status` : เช็กรายชื่อคนไม่มียศ\n• `!botsetup` : เปิดดูคู่มือแผงตั้งค่านี้' 
                }
            )
            .setFooter({ text: `${message.guild.name} • Bot Configuration`, iconURL: message.guild.iconURL({ dynamic: true }) })
            .setTimestamp();

        return message.reply({ embeds: [setupEmbed] });
    }

    if (message.content.startsWith('!status')) {
        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) return;
        const waitMsg = await message.reply('🔄 กำลังประมวลผล...');
        
        const guild = message.guild;
        await guild.members.fetch();
        const members = guild.members.cache.filter(m => !m.user.bot);

        const noRoleList = members.filter(m => m.roles.cache.size <= 1).map(m => `<@${m.id}>`);
        
        const embed = new EmbedBuilder()
            .setTitle(`🚨 [สรุปสถานะสมาชิก] - ${guild.name}`)
            .setColor(0xE74C3C)
            .addFields(
                { name: `❓ ไม่มี Role ใดๆ (${noRoleList.length} คน)`, value: noRoleList.slice(0, 20).join('\n') || 'ไม่มี' }
            )
            .setTimestamp();

        return waitMsg.edit({ content: '✅ ประมวลผลเสร็จสิ้น:', embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
