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

const fs = require('fs');
const path = require('path');

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
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID;
const BANNED_ROLE_ID = process.env.BANNED_ROLE_ID;
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID || process.env.REPORT_LOG_CHANNEL_ID;

// 📁 บันทึกข้อมูลระบบพิมพ์จุดลงไฟล์เพื่อไม่ให้หายตอนรีสตาร์ท
const CONFIG_FILE = path.join(__dirname, 'dot_configs.json');

function loadDotConfigs() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const data = fs.readFileSync(CONFIG_FILE, 'utf8');
            return new Map(Object.entries(JSON.parse(data)));
        }
    } catch (err) {
        console.error('❌ อ่านไฟล์ dot_configs.json ล้มเหลว:', err);
    }
    return new Map();
}

function saveDotConfigs(mapData) {
    try {
        const obj = Object.fromEntries(mapData);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ บันทึกไฟล์ dot_configs.json ล้มเหลว:', err);
    }
}

// โหลดข้อมูลพิมพ์จุดเดิมกลับมาทำงานอัตโนมัติ
client.dotRoleConfigs = loadDotConfigs();
client.boostConfigs = new Map();
client.welcomeConfigs = new Map();
client.staffApplyConfigs = new Map();

// 🛠️ ฟังก์ชันแปลงข้อความที่มีตัวแปร {}
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

// 1. Slash Commands Definition
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
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกห้องที่ต้องการให้พิมพ์จุด')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('เลือกยศที่จะให้เมื่อพิมพ์จุด')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('banner_url')
                .setDescription('ใส่ลิงก์รูปภาพ Banner ใน Embed (ใส่ - หรือเว้นว่างถ้าไม่มี)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('โค้ดสี HEX เช่น #2ECC71 หรือ GREEN')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-boost')
        .setDescription('ตั้งค่าระบบขอบคุณคน Boost')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('channel').setDescription('ห้องรับการแจ้งเตือน').setRequired(true))
        .addStringOption(option => option.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('ข้อความ Embed').setRequired(false))
        .addStringOption(option => option.setName('content_message').setDescription('ข้อความแจ้งเตือนนอก Embed').setRequired(false))
        .addStringOption(option => option.setName('banner_url').setDescription('รูป Banner').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-boost')
        .setDescription('ทดสอบส่งข้อความแจ้งเตือน Boost จำลอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('ตั้งค่าระบบต้อนรับสมาชิกใหม่')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('channel').setDescription('ห้องต้อนรับ').setRequired(true))
        .addStringOption(option => option.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('ข้อความ Embed').setRequired(false))
        .addStringOption(option => option.setName('content_message').setDescription('ข้อความนอก Embed').setRequired(false))
        .addStringOption(option => option.setName('banner_url').setDescription('รูป Banner').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-welcome')
        .setDescription('ทดสอบส่งข้อความต้อนรับจำลอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-staff-apply')
        .setDescription('ประกาศเปิดรับสมัครทีมงาน พร้อมกำหนดวันปิดรับสมัคร')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option => option.setName('channel').setDescription('ช่องประกาศ').setRequired(true))
        .addStringOption(option => option.setName('positions').setDescription('ตำแหน่ง (คั่นด้วยจุลภาค)').setRequired(true))
        .addStringOption(option => option.setName('roles').setDescription('ID ยศ (คั่นด้วยจุลภาค)').setRequired(true))
        .addStringOption(option => option.setName('end_date').setDescription('วันปิดรับสมัคร (DD/MM/YYYY)').setRequired(true))
        .addStringOption(option => option.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(option => option.setName('description').setDescription('รายละเอียด Embed').setRequired(false))
        .addStringOption(option => option.setName('banner_url').setDescription('ลิงก์ Banner').setRequired(false))
        .addStringOption(option => option.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('close-staff-apply')
        .setDescription('สั่งปิดรับสมัครทีมงานทันที')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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

// 2. Interaction Handlers
client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'setup-ticket') {
                const embed = new EmbedBuilder()
                    .setTitle('🎫 ระบบแจ้งปัญหา / ติดต่อสอบถาม')
                    .setDescription('หากท่านพบปัญหาในการใช้งาน ต้องการสอบถามข้อมูลเพิ่มเติม หรือแจ้งเรื่องร้องเรียน\nกรุณาคลิกที่ปุ่ม **"📩 แจ้งปัญหาที่นี่"** ด้านล่างเพื่อเปิดตั๋วติดต่อทีมงานครับ')
                    .setColor(0x3498DB)
                    .setFooter({ text: 'ระบบสนับสนุนผู้ใช้งาน • บริการตลอด 24 ชั่วโมง' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_ticket_btn')
                        .setLabel('📩 แจ้งปัญหาที่นี่')
                        .setStyle(ButtonStyle.Primary)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return await interaction.reply({ content: '✅ สร้างระบบ Ticket เรียบร้อยแล้ว!', ephemeral: true });
            }

            if (interaction.commandName === 'setup-report') {
                const embed = new EmbedBuilder()
                    .setTitle('🚨 ศูนย์รับแจ้งรายงานผู้กระทำผิด')
                    .setDescription('หากคุณพบเห็นผู้เล่นที่ทำผิดกฎเซิร์ฟเวอร์ ใช้โปรแกรมโกง หรือก่อความวุ่นวาย\nสามารถกดปุ่ม **"รายงานผู้กระทำผิด"** ด้านล่างเพื่อส่งข้อมูลให้แอดมินตรวจสอบได้ทันทีครับ')
                    .setColor(0xE74C3C)
                    .setFooter({ text: 'ความปรารถนาดีจากทีมงานผู้ดูแลเซิร์ฟเวอร์' });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('open_report_btn')
                        .setLabel('🚨 รายงานผู้กระทำผิด')
                        .setStyle(ButtonStyle.Danger)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return await interaction.reply({ content: '✅ สร้างระบบ Report เรียบร้อยแล้ว!', ephemeral: true });
            }

            if (interaction.commandName === 'setup-admin') {
                const embed = new EmbedBuilder()
                    .setTitle('🛡️ แผงควบคุมและจัดการผู้ใช้ (Admin Dashboard)')
                    .setDescription('เมนูสำหรับทีมงานและผู้ดูแลระบบในการจัดการผู้เล่น\nกรุณากดปุ่มเพื่อเลือกคำสั่งที่ต้องการดำเนินการ')
                    .setColor(0x2ECC71);

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('admin_blacklist_btn')
                        .setLabel('🚫 แบล็กลิสต์')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('admin_unblacklist_btn')
                        .setLabel('✅ ปลดแบล็กลิสต์')
                        .setStyle(ButtonStyle.Success),
                    new ButtonBuilder()
                        .setCustomId('admin_ban_btn')
                        .setLabel('🔨 แบนผู้ใช้')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('admin_unban_btn')
                        .setLabel('🔓 ปลดแบน')
                        .setStyle(ButtonStyle.Secondary)
                );

                await interaction.channel.send({ embeds: [embed], components: [row] });
                return await interaction.reply({ content: '✅ สร้างระบบ Admin Dashboard เรียบร้อยแล้ว!', ephemeral: true });
            }

            if (interaction.commandName === 'setup-dot-role') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                const targetRole = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#2ECC71';

                // 📌 บันทึกค่าลง Map และเซฟใส่ไฟล์ JSON ทันที
                client.dotRoleConfigs.set(targetChannel.id, {
                    roleId: targetRole.id,
                    bannerUrl: (bannerUrl && bannerUrl !== '-') ? bannerUrl : null,
                    color: colorHex
                });
                saveDotConfigs(client.dotRoleConfigs);

                const countInRoom = interaction.guild.members.cache.filter(m => m.roles.cache.has(targetRole.id)).size;

                const embed = new EmbedBuilder()
                    .setTitle('⚙️ ตั้งค่าระบบพิมพ์จุดรับยศสำเร็จ!')
                    .setColor(0x2ECC71)
                    .setDescription(`ตั้งค่าการรับยศ **${targetRole.name}** (${countInRoom} Member) ในห้อง <#${targetChannel.id}> เรียบร้อยครับ! *(ข้อมูลถูกบันทึกถาวรแล้ว)*`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (interaction.commandName === 'setup-boost') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🚀 ขอบคุณสำหรับการ Server Boost!';
                const description = interaction.options.getString('description') || 'ขอบคุณคุณ {user} มากๆ ที่ทำการ Boost เซิร์ฟเวอร์ {guild} ให้เรา!\nตอนนี้เซิร์ฟเวอร์เรามี Boost ทั้งหมด {boosts} Boosts แล้ว ❤️';
                const contentMsg = interaction.options.getString('content_message') || '🎉 {user} ได้ทำ Boost เซิร์ฟเวอร์!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#F47FFF';

                client.boostConfigs.set(interaction.guild.id, {
                    channelId: channel.id,
                    title,
                    description,
                    contentMsg,
                    bannerUrl: (bannerUrl && bannerUrl !== '-') ? bannerUrl : null,
                    color: colorHex
                });

                return await interaction.reply({ content: `✅ ตั้งค่าระบบขอบคุณคน Boost ในห้อง <#${channel.id}> เรียบร้อยแล้ว!`, ephemeral: true });
            }

            if (interaction.commandName === 'test-boost') {
                const config = client.boostConfigs.get(interaction.guild.id);
                if (!config) {
                    return await interaction.reply({ content: '❌ ยังไม่ได้ตั้งค่าระบบ Boost ในเซิร์ฟเวอร์นี้! กรุณาใช้คำสั่ง `/setup-boost` ก่อนครับ', ephemeral: true });
                }

                const targetChannel = interaction.guild.channels.cache.get(config.channelId);
                if (!targetChannel) {
                    return await interaction.reply({ content: '❌ ไม่พบห้องที่ตั้งค่าไว้!', ephemeral: true });
                }

                const parsedContent = parseCustomTags(config.contentMsg, interaction.guild, interaction.member);
                const parsedTitle = parseCustomTags(config.title, interaction.guild, interaction.member);
                const parsedDesc = parseCustomTags(config.description, interaction.guild, interaction.member);

                const embed = new EmbedBuilder()
                    .setTitle(parsedTitle)
                    .setDescription(parsedDesc)
                    .setColor(config.color || '#F47FFF')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (config.bannerUrl) embed.setImage(config.bannerUrl);

                await targetChannel.send({ content: parsedContent, embeds: [embed] });
                return await interaction.reply({ content: '✅ ส่งข้อความทดสอบ Boost สำเร็จ!', ephemeral: true });
            }

            if (interaction.commandName === 'setup-welcome') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🎉 ยินดีต้อนรับสมาชิกใหม่!';
                const description = interaction.options.getString('description') || 'ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ {guild}!\nตอนนี้เซิร์ฟเวอร์เรามีสมาชิกทั้งหมด {memberCount} คนแล้ว ขอให้สนุกกับการพูดคุยครับ ❤️';
                const contentMsg = interaction.options.getString('content_message') || '✨ ยินดีต้อนรับ {user} เข้าสู่เซิร์ฟเวอร์!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#2ECC71';

                client.welcomeConfigs.set(interaction.guild.id, {
                    channelId: channel.id,
                    title,
                    description,
                    contentMsg,
                    bannerUrl: (bannerUrl && bannerUrl !== '-') ? bannerUrl : null,
                    color: colorHex
                });

                return await interaction.reply({ content: `✅ ตั้งค่าระบบต้อนรับสมาชิกใหม่ในห้อง <#${channel.id}> เรียบร้อยแล้ว!`, ephemeral: true });
            }

            if (interaction.commandName === 'test-welcome') {
                const config = client.welcomeConfigs.get(interaction.guild.id);
                if (!config) {
                    return await interaction.reply({ content: '❌ ยังไม่ได้ตั้งค่าระบบ Welcome ในเซิร์ฟเวอร์นี้! กรุณาใช้คำสั่ง `/setup-welcome` ก่อนครับ', ephemeral: true });
                }

                const targetChannel = interaction.guild.channels.cache.get(config.channelId);
                if (!targetChannel) {
                    return await interaction.reply({ content: '❌ ไม่พบห้องที่ตั้งค่าไว้!', ephemeral: true });
                }

                const parsedContent = parseCustomTags(config.contentMsg, interaction.guild, interaction.member);
                const parsedTitle = parseCustomTags(config.title, interaction.guild, interaction.member);
                const parsedDesc = parseCustomTags(config.description, interaction.guild, interaction.member);

                const embed = new EmbedBuilder()
                    .setTitle(parsedTitle)
                    .setDescription(parsedDesc)
                    .setColor(config.color || '#2ECC71')
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (config.bannerUrl) embed.setImage(config.bannerUrl);

                await targetChannel.send({ content: parsedContent, embeds: [embed] });
                return await interaction.reply({ content: '✅ ส่งข้อความทดสอบ Welcome สำเร็จ!', ephemeral: true });
            }

            if (interaction.commandName === 'setup-staff-apply') {
                const channel = interaction.options.getChannel('channel');
                const rawPositions = interaction.options.getString('positions').split(',').map(s => s.trim());
                const rawRoles = interaction.options.getString('roles').split(',').map(s => s.trim());
                const endDate = interaction.options.getString('end_date');
                const title = interaction.options.getString('title') || '📢 เปิดรับสมัครทีมงานประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'ขณะนี้ทางเซิร์ฟเวอร์กำลังเปิดรับสมัครทีมงานมาร่วมพัฒนาและดูแล community ครับ!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#3498DB';

                if (rawPositions.length !== rawRoles.length) {
                    return await interaction.reply({ content: '❌ จำนวนตำแหน่งและ ID ยศไม่ตรงกัน! กรุณาระบุให้เท่ากัน (คั่นด้วย ,)', ephemeral: true });
                }

                const optionsList = rawPositions.map((pos, idx) => ({
                    label: pos,
                    value: `pos_${idx}`,
                    roleId: rawRoles[idx]
                }));

                client.staffApplyConfigs.set(interaction.guild.id, {
                    channelId: channel.id,
                    positions: optionsList,
                    endDate,
                    isOpen: true
                });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('staff_apply_select')
                    .setPlaceholder('เลือกตำแหน่งที่ต้องการสมัคร...')
                    .addOptions(
                        optionsList.map(opt => 
                            new StringSelectMenuOptionBuilder()
                                .setLabel(opt.label)
                                .setValue(opt.value)
                                .setDescription(`สมัครตำแหน่ง ${opt.label}`)
                        )
                    );

                const row = new ActionRowBuilder().addComponents(selectMenu);

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(`${description}\n\n📅 **ปิดรับสมัครวันที่:** \`${endDate}\`\n\n📌 **ตำแหน่งที่เปิดรับ:**\n${rawPositions.map(p => `• ${p}`).join('\n')}`)
                    .setColor(colorHex)
                    .setFooter({ text: 'กรุณาเลือกตำแหน่งที่ต้องการจากเมนูด้านล่าง' })
                    .setTimestamp();

                if (bannerUrl && bannerUrl !== '-') embed.setImage(bannerUrl);

                const sentMsg = await channel.send({ embeds: [embed], components: [row] });
                client.staffApplyConfigs.get(interaction.guild.id).messageId = sentMsg.id;

                return await interaction.reply({ content: `✅ ประกาศเปิดรับสมัครทีมงานเรียบร้อยในห้อง <#${channel.id}>`, ephemeral: true });
            }

            if (interaction.commandName === 'close-staff-apply') {
                const config = client.staffApplyConfigs.get(interaction.guild.id);
                if (!config || !config.isOpen) {
                    return await interaction.reply({ content: '❌ ไม่พบประกาศรับสมัครที่เปิดอยู่!', ephemeral: true });
                }

                config.isOpen = false;
                const targetChannel = interaction.guild.channels.cache.get(config.channelId);
                if (targetChannel && config.messageId) {
                    const msg = await targetChannel.messages.fetch(config.messageId).catch(() => null);
                    if (msg) {
                        const closedEmbed = EmbedBuilder.from(msg.embeds[0])
                            .setTitle('🔒 ปิดรับสมัครทีมงานแล้ว')
                            .setColor('#E74C3C')
                            .setDescription('ขณะนี้ระบบได้ปิดรับสมัครทีมงานเรียบร้อยแล้ว ขอบคุณทุกท่านที่ให้ความสนใจครับ');
                        
                        await msg.edit({ embeds: [closedEmbed], components: [] });
                    }
                }

                return await interaction.reply({ content: '✅ สั่งปิดการรับสมัครทีมงานเรียบร้อยแล้ว!', ephemeral: true });
            }
        }

        // --- BUTTONS & MODALS INTERACTION ---
        if (interaction.isButton()) {
            if (interaction.customId === 'open_ticket_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('ticket_modal')
                    .setTitle('กรอกรายละเอียดการแจ้งปัญหา');

                const topicInput = new TextInputBuilder()
                    .setCustomId('ticket_topic')
                    .setLabel('หัวข้อเรื่อง / ปัญหาที่พบ')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const detailInput = new TextInputBuilder()
                    .setCustomId('ticket_detail')
                    .setLabel('รายละเอียดเพิ่มเติม')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(topicInput),
                    new ActionRowBuilder().addComponents(detailInput)
                );

                await interaction.showModal(modal);
            }

            if (interaction.customId === 'open_report_btn') {
                const modal = new ModalBuilder()
                    .setCustomId('report_modal')
                    .setTitle('รายงานผู้กระทำผิด');

                const targetInput = new TextInputBuilder()
                    .setCustomId('report_target')
                    .setLabel('ชื่อ / ID ของผู้กระทำผิด')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const reasonInput = new TextInputBuilder()
                    .setCustomId('report_reason')
                    .setLabel('เหตุผล / รายละเอียดการทำผิด')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const proofInput = new TextInputBuilder()
                    .setCustomId('report_proof')
                    .setLabel('ลิงก์รูปภาพหรือคลิปหลักฐาน')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(targetInput),
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(proofInput)
                );

                await interaction.showModal(modal);
            }

            if (['admin_blacklist_btn', 'admin_unblacklist_btn', 'admin_ban_btn', 'admin_unban_btn'].includes(interaction.customId)) {
                const actionTitles = {
                    'admin_blacklist_btn': '🚫 ใส่รายชื่อแบล็กลิสต์ (Blacklist)',
                    'admin_unblacklist_btn': '✅ ปลดรายชื่อแบล็กลิสต์',
                    'admin_ban_btn': '🔨 สั่งแบนผู้ใช้ (Ban)',
                    'admin_unban_btn': '🔓 สั่งปลดแบนผู้ใช้ (Unban)'
                };

                const modal = new ModalBuilder()
                    .setCustomId(`modal_${interaction.customId}`)
                    .setTitle(actionTitles[interaction.customId]);

                const userInput = new TextInputBuilder()
                    .setCustomId('admin_target_user')
                    .setLabel('User ID ของผู้ใช้งาน')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('ตัวอย่าง: 123456789012345678')
                    .setRequired(true);

                const reasonInput = new TextInputBuilder()
                    .setCustomId('admin_action_reason')
                    .setLabel('เหตุผลในการดำเนินการ')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(reasonInput)
                );

                await interaction.showModal(modal);
            }
        }

        // --- SELECT MENUS INTERACTION ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'staff_apply_select') {
                const selectedValue = interaction.values[0];
                const config = client.staffApplyConfigs.get(interaction.guild.id);

                if (!config || !config.isOpen) {
                    return await interaction.reply({ content: '❌ การรับสมัครปิดทำการแล้ว!', ephemeral: true });
                }

                const selectedPos = config.positions.find(p => p.value === selectedValue);

                const modal = new ModalBuilder()
                    .setCustomId(`staff_modal_${selectedValue}`)
                    .setTitle(`ใบสมัคร: ${selectedPos ? selectedPos.label : 'ทีมงาน'}`);

                const nameInput = new TextInputBuilder()
                    .setCustomId('staff_name')
                    .setLabel('ชื่อเล่น / ชื่อเรียก')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const ageInput = new TextInputBuilder()
                    .setCustomId('staff_age')
                    .setLabel('อายุ')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                const expInput = new TextInputBuilder()
                    .setCustomId('staff_exp')
                    .setLabel('ประสบการณ์การทำงานที่ผ่านมา')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true);

                const timeInput = new TextInputBuilder()
                    .setCustomId('staff_time')
                    .setLabel('เวลาที่สะดวกปฏิบัติหน้าที่ (เช่น 18.00-22.00)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(ageInput),
                    new ActionRowBuilder().addComponents(expInput),
                    new ActionRowBuilder().addComponents(timeInput)
                );

                await interaction.showModal(modal);
            }
        }

        // --- MODAL SUBMIT INTERACTION ---
        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'ticket_modal') {
                const topic = interaction.fields.getTextInputValue('ticket_topic');
                const detail = interaction.fields.getTextInputValue('ticket_detail');

                await interaction.reply({ content: '✅ ได้รับข้อมูลการแจ้งปัญหาเรียบร้อยแล้ว ทีมงานจะเร่งตรวจสอบให้เร็วที่สุดครับ!', ephemeral: true });

                const logChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('📩 การแจ้งปัญหาใหม่ (Ticket)')
                        .setColor(0x3498DB)
                        .addFields(
                            { name: '👤 ผู้ส่งเรื่อง', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                            { name: '📌 หัวข้อ', value: topic },
                            { name: '📝 รายละเอียด', value: detail }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] });
                }
            }

            if (interaction.customId === 'report_modal') {
                const target = interaction.fields.getTextInputValue('report_target');
                const reason = interaction.fields.getTextInputValue('report_reason');
                const proof = interaction.fields.getTextInputValue('report_proof') || 'ไม่มีหลักฐานแนบ';

                await interaction.reply({ content: '✅ ส่งรายงานผู้กระทำผิดเรียบร้อย ขอบคุณที่ช่วยดูแลเซิร์ฟเวอร์ครับ!', ephemeral: true });

                const logChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);
                if (logChannel) {
                    const embed = new EmbedBuilder()
                        .setTitle('🚨 รายงานผู้กระทำผิดใหม่ (Report)')
                        .setColor(0xE74C3C)
                        .addFields(
                            { name: '👤 ผู้รายงาน', value: `<@${interaction.user.id}>`, inline: true },
                            { name: '🎯 ผู้ถูกรายงาน', value: target, inline: true },
                            { name: '📝 เหตุผล', value: reason },
                            { name: '🖼️ หลักฐาน', value: proof }
                        )
                        .setTimestamp();
                    await logChannel.send({ embeds: [embed] });
                }
            }

            if (interaction.customId.startsWith('modal_admin_')) {
                const targetId = interaction.fields.getTextInputValue('admin_target_user');
                const reason = interaction.fields.getTextInputValue('admin_action_reason') || 'ไม่ได้ระบุเหตุผล';

                await interaction.deferReply({ ephemeral: true });

                try {
                    if (interaction.customId === 'modal_admin_blacklist_btn') {
                        const blChannel = interaction.guild.channels.cache.get(BLACKLIST_CHANNEL_ID);
                        if (blChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🚫 ประกาศรายชื่อติดแบล็กลิสต์')
                                .setColor(0x000000)
                                .addFields(
                                    { name: '👤 ผู้ถูกแบล็กลิสต์', value: `<@${targetId}> (${targetId})` },
                                    { name: '📝 เหตุผล', value: reason },
                                    { name: '🛡️ ดำเนินการโดย', value: `<@${interaction.user.id}>` }
                                )
                                .setTimestamp();
                            await blChannel.send({ embeds: [embed] });
                        }
                        await interaction.editReply({ content: `✅ ดำเนินการเพิ่ม <@${targetId}> ลงในรายการแบล็กลิสต์เรียบร้อย!` });
                    }

                    if (interaction.customId === 'modal_admin_unblacklist_btn') {
                        const blChannel = interaction.guild.channels.cache.get(BLACKLIST_CHANNEL_ID);
                        if (blChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle('✅ ประกาศปลดรายชื่อแบล็กลิสต์')
                                .setColor(0x2ECC71)
                                .addFields(
                                    { name: '👤 ผู้ได้รับการปลด', value: `<@${targetId}> (${targetId})` },
                                    { name: '📝 เหตุผล', value: reason },
                                    { name: '🛡️ ดำเนินการโดย', value: `<@${interaction.user.id}>` }
                                )
                                .setTimestamp();
                            await blChannel.send({ embeds: [embed] });
                        }
                        await interaction.editReply({ content: `✅ ดำเนินการปลดแบล็กลิสต์ให้ <@${targetId}> เรียบร้อย!` });
                    }

                    if (interaction.customId === 'modal_admin_ban_btn') {
                        await interaction.guild.members.ban(targetId, { reason });
                        const banChannel = interaction.guild.channels.cache.get(BAN_LOG_CHANNEL_ID);
                        if (banChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🔨 การลงโทษ: แบนผู้ใช้')
                                .setColor(0xFF0000)
                                .addFields(
                                    { name: '👤 ผู้ถูกแบน', value: `<@${targetId}> (${targetId})` },
                                    { name: '📝 เหตุผล', value: reason },
                                    { name: '🛡️ ดำเนินการโดย', value: `<@${interaction.user.id}>` }
                                )
                                .setTimestamp();
                            await banChannel.send({ embeds: [embed] });
                        }
                        await interaction.editReply({ content: `✅ สั่งแบน <@${targetId}> เรียบร้อยแล้ว!` });
                    }

                    if (interaction.customId === 'modal_admin_unban_btn') {
                        await interaction.guild.members.unban(targetId, reason);
                        const banChannel = interaction.guild.channels.cache.get(BAN_LOG_CHANNEL_ID);
                        if (banChannel) {
                            const embed = new EmbedBuilder()
                                .setTitle('🔓 การลงโทษ: ปลดแบนผู้ใช้')
                                .setColor(0x2ECC71)
                                .addFields(
                                    { name: '👤 ผู้ได้รับการปลดแบน', value: `<@${targetId}> (${targetId})` },
                                    { name: '📝 เหตุผล', value: reason },
                                    { name: '🛡️ ดำเนินการโดย', value: `<@${interaction.user.id}>` }
                                )
                                .setTimestamp();
                            await banChannel.send({ embeds: [embed] });
                        }
                        await interaction.editReply({ content: `✅ สั่งปลดแบน <@${targetId}> เรียบร้อยแล้ว!` });
                    }
                } catch (err) {
                    console.error('Admin Action Error:', err);
                    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด ไม่สามารถดำเนินการได้: ${err.message}` });
                }
            }

            if (interaction.customId.startsWith('staff_modal_')) {
                const posValue = interaction.customId.replace('staff_modal_', '');
                const config = client.staffApplyConfigs.get(interaction.guild.id);
                const selectedPos = config ? config.positions.find(p => p.value === posValue) : null;

                const name = interaction.fields.getTextInputValue('staff_name');
                const age = interaction.fields.getTextInputValue('staff_age');
                const exp = interaction.fields.getTextInputValue('staff_exp');
                const time = interaction.fields.getTextInputValue('staff_time');

                await interaction.reply({ content: '✅ ส่งใบสมัครเรียบร้อยแล้ว! ทางทีมงานจะพิจารณาและติดต่อกลับไปครับ', ephemeral: true });

                const staffLog = interaction.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);
                if (staffLog) {
                    const embed = new EmbedBuilder()
                        .setTitle('📝 มีใบสมัครทีมงานใหม่!')
                        .setColor(0xF1C40F)
                        .addFields(
                            { name: '👤 ผู้สมัคร', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
                            { name: '📌 ตำแหน่งที่สมัคร', value: selectedPos ? selectedPos.label : posValue, inline: true },
                            { name: '🏷️ ชื่อเล่น / อายุ', value: `${name} (อายุ ${age} ปี)` },
                            { name: '💼 ประสบการณ์', value: exp },
                            { name: '⏰ เวลาที่สะดวก', value: time }
                        )
                        .setTimestamp();

                    await staffLog.send({ embeds: [embed] });
                }
            }
        }
    } catch (err) {
        console.error('Interaction Handling Error:', err);
    }
});

// 🔴 3. ระบบตรวจจับการพิมพ์จุด (.) รับยศ (บันทึกคงทน + กันหลุด)
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.trim() === '.') {
        const config = client.dotRoleConfigs.get(message.channel.id);
        if (!config) return;

        const roleId = typeof config === 'string' ? config : config.roleId;

        try {
            const role = message.guild.roles.cache.get(roleId);
            if (!role) return;

            if (message.member.roles.cache.has(roleId)) {
                await message.react('⚠️').catch(() => null);
                const warnMsg = await message.channel.send({
                    content: `⚠️ <@${message.author.id}> คุณมียศ **${role.name}** อยู่แล้วครับ!`
                }).catch(() => null);

                if (warnMsg) {
                    setTimeout(() => warnMsg.delete().catch(() => null), 4000);
                }
                return;
            }

            await message.member.roles.add(role);
            await message.react('✅').catch(() => null);

            const embedColor = config.color || '#2ECC71';
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('🎉 ยินดีต้อนรับสมาชิกใหม่!')
                .setColor(embedColor)
                .setDescription(`✨ ยินดีต้อนรับคุณ <@${message.author.id}> เข้าสู่เซิร์ฟเวอร์!\nระบบได้ทำการมอบยศให้เรียบร้อยแล้วครับ ✅`)
                .addFields(
                    { name: '🏷️ ยศที่ได้รับ', value: `<@&${role.id}>`, inline: true },
                    { name: '📌 สถานะ', value: '\` สำเร็จเรียบร้อย \`', inline: true }
                )
                .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
                .setFooter({ 
                    text: `${message.guild.name} • ระบบรับยศอัตโนมัติ`, 
                    iconURL: message.guild.iconURL({ dynamic: true }) 
                })
                .setTimestamp();

            if (config.bannerUrl) {
                welcomeEmbed.setImage(config.bannerUrl);
            }

            await message.channel.send({
                content: `✨ <@${message.author.id}> ได้รับยศเรียบร้อยแล้ว!`,
                embeds: [welcomeEmbed]
            }).catch(() => null);

        } catch (error) {
            console.error('❌ เกิดข้อผิดพลาดในระบบแจกยศ:', error);
        }
    }
});

// 📌 4. Guard ป้องกันบอทดับกลางอากาศเวลามี Error
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ ตรวจพบ Unhandled Rejection (บอททำงานต่อได้):', reason);
});

process.on('uncaughtException', (err, origin) => {
    console.error('⚠️ ตรวจพบ Uncaught Exception (บอททำงานต่อได้):', err);
});

client.login(TOKEN);
