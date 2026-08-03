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
const BLACKLIST_CHANNEL_ID = process.env.BLACKLIST_CHANNEL_ID;
const REPORT_LOG_CHANNEL_ID = process.env.REPORT_LOG_CHANNEL_ID;
const BAN_LOG_CHANNEL_ID = process.env.BAN_LOG_CHANNEL_ID;
const BANNED_ROLE_ID = process.env.BANNED_ROLE_ID;

// 📌 ไอดีห้องตรวจสอบข้อมูลผู้สมัครทีมงาน
const STAFF_LOG_CHANNEL_ID = process.env.STAFF_LOG_CHANNEL_ID || process.env.REPORT_LOG_CHANNEL_ID;

client.dotRoleConfigs = client.dotRoleConfigs || new Map();
client.boostConfigs = client.boostConfigs || new Map();
client.welcomeConfigs = client.welcomeConfigs || new Map();
client.staffApplyConfigs = client.staffApplyConfigs || new Map(); // เก็บการตั้งค่าตำแหน่งสมัคร + กำหนดการเปิด/ปิด

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
        .setDescription('ตั้งค่าระบบขอบคุณคน Boost (ใช้คำสั่ง {} อัตโนมัติได้)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกห้องที่ต้องการให้ส่งข้อความขอบคุณคน Boost')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('หัวข้อ Embed (ใช้ {user}, {guild} ได้)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('ข้อความ Embed (ใช้ {user}, {#ห้อง}, {@ยศ}, {guild}, {boosts} ได้)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('content_message')
                .setDescription('ข้อความแจ้งเตือนนอก Embed (ใช้ {user}, {@ยศ} แท็กคนได้หมด)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('banner_url')
                .setDescription('ลิงก์รูปภาพ Banner ด้านล่าง Embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('โค้ดสี HEX เช่น #F47FFF หรือ PINK')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-boost')
        .setDescription('ทดสอบส่งข้อความแจ้งเตือน Boost จำลองไปยังห้องที่ตั้งค่าไว้')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup-welcome')
        .setDescription('ตั้งค่าระบบต้อนรับสมาชิกใหม่ (Welcome)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกห้องสำหรับส่งข้อความต้อนรับ')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('หัวข้อ Embed (ใช้ {user}, {guild}, {username} ได้)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('ข้อความ Embed (ใช้ {user}, {guild}, {memberCount}, {#ห้อง}, {@ยศ} ได้)')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('content_message')
                .setDescription('ข้อความข้อความนอก Embed (เช่น แท็กคน {user})')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('banner_url')
                .setDescription('ลิงก์รูปภาพ Banner ด้านล่าง Embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('โค้ดสี HEX เช่น #5865F2 หรือ GREEN')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('test-welcome')
        .setDescription('ทดสอบส่งข้อความต้อนรับสมาชิกใหม่จำลอง')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setup_buttons')
        .setDescription('เพิ่มปุ่มกดรับยศใส่ข้อความเดิม (ส่งจากห้องไหนก็ได้)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกห้องที่ข้อความนั้นอยู่')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID ของข้อความเดิมที่ต้องการเพิ่มปุ่ม')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('role1')
                .setDescription('ยศที่ 1')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('label1')
                .setDescription('ข้อความบนปุ่มที่ 1 (เช่น "รับยศสมาชิก")')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('style1')
                .setDescription('สีปุ่มที่ 1')
                .setRequired(false)
                .addChoices(
                    { name: '🔵 สีน้ำเงิน (Primary)', value: 'Primary' },
                    { name: 'เพลน/เทา (Secondary)', value: 'Secondary' },
                    { name: '🟢 สีเขียว (Success)', value: 'Success' },
                    { name: '🔴 สีแดง (Danger)', value: 'Danger' }
                ))
        .addStringOption(option =>
            option.setName('emoji1')
                .setDescription('Emoji ปุ่มที่ 1 (เช่น ✨ หรือ 👑)')
                .setRequired(false))
        .addRoleOption(option => option.setName('role2').setDescription('ยศที่ 2').setRequired(false))
        .addStringOption(option => option.setName('label2').setDescription('ข้อความบนปุ่มที่ 2').setRequired(false))
        .addStringOption(option => option.setName('style2').setDescription('สีปุ่มที่ 2').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(option => option.setName('emoji2').setDescription('Emoji ปุ่มที่ 2').setRequired(false))
        .addRoleOption(option => option.setName('role3').setDescription('ยศที่ 3').setRequired(false))
        .addStringOption(option => option.setName('label3').setDescription('ข้อความบนปุ่มที่ 3').setRequired(false))
        .addStringOption(option => option.setName('style3').setDescription('สีปุ่มที่ 3').setRequired(false)
            .addChoices(
                { name: '🔵 สีน้ำเงิน', value: 'Primary' },
                { name: 'เพลน/เทา', value: 'Secondary' },
                { name: '🟢 สีเขียว', value: 'Success' },
                { name: '🔴 สีแดง', value: 'Danger' }
            ))
        .addStringOption(option => option.setName('emoji3').setDescription('Emoji ปุ่มที่ 3').setRequired(false))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('ใส่ลิงก์รูปภาพ Banner ใน Embed (ถ้ามี)')
                .setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup_dropdown')
        .setDescription('เพิ่ม Dropdown เลือกยศแบบไม่จำกัดใส่ข้อความเดิม')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID ของข้อความเดิมที่ต้องการใส่ Dropdown')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('role_ids')
                .setDescription('ใส่ ID ของยศ คั่นด้วยเครื่องหมายจุลภาค (เช่น 1234567,8901234,5678901)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('placeholder')
                .setDescription('ข้อความตัวอย่างบน Dropdown')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('image_url')
                .setDescription('ลิงก์รูปภาพ Banner (ถ้ามี)')
                .setRequired(false)),

    // 🌟 อัปเดตคำสั่งเปิดรับสมัครทีมงาน พร้อมเลือกห้องประกาศ และระบุวันปิดรับสมัคร
    new SlashCommandBuilder()
        .setName('setup-staff-apply')
        .setDescription('ประกาศเปิดรับสมัครทีมงาน พร้อมกำหนดวันปิดรับสมัคร')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('เลือกช่องที่จะส่งประกาศเปิดรับสมัคร')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('positions')
                .setDescription('ระบุตำแหน่ง คั่นด้วยจุลภาค เช่น Moderator,Support,Admin')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('roles')
                .setDescription('ระบุ ID ยศที่จะได้รับตรงกับตำแหน่งตามลำดับ คั่นด้วยจุลภาค')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('end_date')
                .setDescription('วันที่ปิดรับสมัคร (รูปแบบ DD/MM/YYYY เช่น 25/12/2026)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('title')
                .setDescription('หัวข้อ Embed ใบสมัคร')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('description')
                .setDescription('รายละเอียดใน Embed ใบสมัคร')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('banner_url')
                .setDescription('ลิงก์รูป Banner ใน Embed')
                .setRequired(false))
        .addStringOption(option =>
            option.setName('color')
                .setDescription('โค้ดสี HEX เช่น #5865F2')
                .setRequired(false)),

    // 🌟 คำสั่งสำหรับปิดรับสมัครทันที
    new SlashCommandBuilder()
        .setName('close-staff-apply')
        .setDescription('สั่งปิดรับสมัครทีมงานทันที')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
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

// 2. Interaction Listener
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
                const description = interaction.options.getString('description') || '💖 ขอบคุณคุณ {user} มากๆ นะครับที่ช่วยสนับสนุนเซิร์ฟเวอร์ **{guild}**!\n\nแวะไปพูดคุยกับเพื่อนๆ ได้ที่ห้อง {#พูดคุย-ทั่วไป} หรือดูสิทธิ์พิเศษที่ยศ {@Booster} ได้เลย!';
                const contentMessage = interaction.options.getString('content_message') || '🎉 **NEW BOOST!** ขอบคุณ {user} มากๆ ครับ! 🚀✨';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#F47FFF';

                client.boostConfigs.set(interaction.guild.id, {
                    channelId: targetChannel.id,
                    title,
                    description,
                    contentMessage,
                    bannerUrl,
                    color
                });

                const previewEmbed = new EmbedBuilder()
                    .setTitle('⚙️ ตั้งค่าระบบแจ้งเตือน Boost เรียบร้อย!')
                    .setColor(0x2ECC71)
                    .setDescription(`ตั้งค่าการแจ้งเตือนไว้ที่ห้อง <#${targetChannel.id}> เรียบร้อยครับ!\n\n💡 **คุณสามารถพิมพ์ `/test-boost` เพื่อทดสอบระบบได้ทันที!**`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [previewEmbed] });
            }

            if (interaction.commandName === 'test-boost') {
                await interaction.deferReply({ ephemeral: true });

                const boostConfig = client.boostConfigs.get(interaction.guild.id) || {
                    channelId: interaction.channel.id,
                    title: '🚀 ขอบคุณสำหรับการ Server Boost!',
                    description: '💖 ขอบคุณคุณ {user} มากๆ นะครับที่ช่วยสนับสนุนเซิร์ฟเวอร์ **{guild}**!\n\nแวะไปพูดคุยกับเพื่อนๆ ได้ที่ห้อง {#พูดคุย-ทั่วไป} หรือดูสิทธิ์พิเศษที่ยศ {@Booster} ได้เลย!',
                    contentMessage: '🎉 **TEST BOOST!** ขอบคุณ {user} มากๆ ครับ! 🚀✨',
                    bannerUrl: null,
                    color: '#F47FFF'
                };

                const targetChan = interaction.guild.channels.cache.get(boostConfig.channelId) || interaction.channel;

                const formattedTitle = parseCustomTags(boostConfig.title, interaction.guild, interaction.member);
                const formattedDesc = parseCustomTags(boostConfig.description, interaction.guild, interaction.member);
                const formattedContent = parseCustomTags(boostConfig.contentMessage, interaction.guild, interaction.member);

                const testEmbed = new EmbedBuilder()
                    .setTitle(formattedTitle)
                    .setColor(boostConfig.color || '#F47FFF')
                    .setDescription(formattedDesc)
                    .addFields(
                        { name: '👤 ผู้สนับสนุน (Booster)', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '💎 ยอด Boost รวม', value: `\`${interaction.guild.premiumSubscriptionCount || 0}\` บูสต์`, inline: true },
                        { name: '⭐ Server Level', value: `\`Level ${interaction.guild.premiumTier}\``, inline: true }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `${interaction.guild.name} • (ทดสอบระบบ Boost) 💖` })
                    .setTimestamp();

                if (boostConfig.bannerUrl && boostConfig.bannerUrl.startsWith('http')) {
                    testEmbed.setImage(boostConfig.bannerUrl);
                }

                await targetChan.send({
                    content: `⚠️ **[ข้อความทดสอบระบบ BOOST]**\n${formattedContent}`,
                    embeds: [testEmbed]
                }).catch(() => null);

                return await interaction.editReply({ 
                    content: `✅ ส่งข้อความทดสอบระบบ Boost ไปที่ห้อง <#${targetChan.id}> เรียบร้อยแล้วครับ!`
                });
            }

            if (interaction.commandName === 'setup-welcome') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title') || '🎉 ยินดีต้อนรับสู่ {guild}!';
                const description = interaction.options.getString('description') || '👋 ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ **{guild}** ครับ!\n\nขณะนี้เซิร์ฟเวอร์ของเรามีสมาชิกทั้งหมด **{memberCount}** คนแล้ว ✨\nขอให้สนุกกับการอยู่ร่วมกันนะครับ!';
                const contentMessage = interaction.options.getString('content_message') || '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const color = interaction.options.getString('color') || '#5865F2';

                client.welcomeConfigs.set(interaction.guild.id, {
                    channelId: targetChannel.id,
                    title,
                    description,
                    contentMessage,
                    bannerUrl,
                    color
                });

                const resultEmbed = new EmbedBuilder()
                    .setTitle('⚙️ ตั้งค่าระบบต้อนรับ (Welcome) เรียบร้อย!')
                    .setColor(0x2ECC71)
                    .setDescription(`ตั้งค่าห้องต้อนรับไปที่ <#${targetChannel.id}> เรียบร้อยครับ!\n\n💡 **พิมพ์ `/test-welcome` เพื่อทดสอบข้อความต้อนรับได้ทันที!**`)
                    .setTimestamp();

                return await interaction.editReply({ embeds: [resultEmbed] });
            }

            if (interaction.commandName === 'test-welcome') {
                await interaction.deferReply({ ephemeral: true });

                const welcomeConfig = client.welcomeConfigs.get(interaction.guild.id) || {
                    channelId: interaction.channel.id,
                    title: '🎉 ยินดีต้อนรับสู่ {guild}!',
                    description: '👋 ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ **{guild}** ครับ!\n\nขณะนี้เซิร์ฟเวอร์ของเรามีสมาชิกทั้งหมด **{memberCount}** คนแล้ว ✨\nขอให้สนุกกับการอยู่ร่วมกันนะครับ!',
                    contentMessage: '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!',
                    bannerUrl: null,
                    color: '#5865F2'
                };

                const targetChan = interaction.guild.channels.cache.get(welcomeConfig.channelId) || interaction.channel;

                const formattedTitle = parseCustomTags(welcomeConfig.title, interaction.guild, interaction.member);
                const formattedDesc = parseCustomTags(welcomeConfig.description, interaction.guild, interaction.member);
                const formattedContent = parseCustomTags(welcomeConfig.contentMessage, interaction.guild, interaction.member);

                const testEmbed = new EmbedBuilder()
                    .setTitle(formattedTitle)
                    .setColor(welcomeConfig.color || '#5865F2')
                    .setDescription(formattedDesc)
                    .addFields(
                        { name: '👤 สมาชิกใหม่', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '📊 ลำดับสมาชิก', value: `คนที่ \`${interaction.guild.memberCount}\``, inline: true }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: `${interaction.guild.name} • (ทดสอบระบบ Welcome) 🎉` })
                    .setTimestamp();

                if (welcomeConfig.bannerUrl && welcomeConfig.bannerUrl.startsWith('http')) {
                    testEmbed.setImage(welcomeConfig.bannerUrl);
                }

                await targetChan.send({
                    content: `⚠️ **[ข้อความทดสอบระบบ WELCOME]**\n${formattedContent}`,
                    embeds: [testEmbed]
                }).catch(() => null);

                return await interaction.editReply({ 
                    content: `✅ ส่งข้อความทดสอบระบบ Welcome ไปที่ห้อง <#${targetChan.id}> เรียบร้อยแล้วครับ!`
                });
            }

            if (interaction.commandName === 'setup_buttons') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                const messageId = interaction.options.getString('message_id').trim();
                const imageUrl = interaction.options.getString('image_url')?.trim();

                let targetMessage;
                try {
                    targetMessage = await targetChannel.messages.fetch(messageId);
                } catch (err) {
                    return await interaction.editReply({ 
                        content: `❌ ไม่พบข้อความ ID: \`${messageId}\` ในห้อง <#${targetChannel.id}> กรุณาตรวจสอบ ID และสิทธิ์บอท` 
                    });
                }

                const row = new ActionRowBuilder();
                let buttonCount = 0;

                const styleMap = {
                    'Primary': ButtonStyle.Primary,
                    'Secondary': ButtonStyle.Secondary,
                    'Success': ButtonStyle.Success,
                    'Danger': ButtonStyle.Danger
                };

                for (let i = 1; i <= 3; i++) {
                    const role = interaction.options.getRole(`role${i}`);
                    const label = interaction.options.getString(`label${i}`);
                    const styleStr = interaction.options.getString(`style${i}`) || 'Primary';
                    const emoji = interaction.options.getString(`emoji${i}`);

                    if (role && label) {
                        const btn = new ButtonBuilder()
                            .setCustomId(`btn_toggle_role_${role.id}`)
                            .setLabel(label)
                            .setStyle(styleMap[styleStr] || ButtonStyle.Primary);

                        if (emoji) btn.setEmoji(emoji);

                        row.addComponents(btn);
                        buttonCount++;
                    }
                }

                if (buttonCount === 0) {
                    return await interaction.editReply({ content: '❌ คุณต้องระบุยศและข้อความปุ่มอย่างน้อย 1 ชุด!' });
                }

                let embedsToUse = [...(targetMessage.embeds || [])];
                if (imageUrl && imageUrl.startsWith('http')) {
                    if (embedsToUse.length > 0) {
                        const newEmbed = EmbedBuilder.from(embedsToUse[0]).setImage(imageUrl);
                        embedsToUse[0] = newEmbed;
                    } else {
                        const newEmbed = new EmbedBuilder().setImage(imageUrl);
                        embedsToUse.push(newEmbed);
                    }
                }

                try {
                    if (targetMessage.author.id === client.user.id) {
                        await targetMessage.edit({ embeds: embedsToUse, components: [row] });
                        return await interaction.editReply({ 
                            content: `✅ เพิ่มปุ่มรับยศ ${buttonCount} ปุ่ม ให้ข้อความในห้อง <#${targetChannel.id}> เรียบร้อยแล้ว!` 
                        });
                    } else {
                        const payload = {
                            content: targetMessage.content || null,
                            embeds: embedsToUse,
                            files: Array.from(targetMessage.attachments.values()),
                            components: [row]
                        };

                        await targetChannel.send(payload);
                        return await interaction.editReply({ 
                            content: `✅ สร้างข้อความใหม่พร้อมแนบปุ่มให้ในห้อง <#${targetChannel.id}> เรียบร้อยแล้วครับ!` 
                        });
                    }
                } catch (error) {
                    console.error('Error attaching buttons:', error);
                    return await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการแก้ไขข้อความ' });
                }
            }

            if (interaction.commandName === 'setup-ticket') {
                const modal = createSetupModal('modal_config_ticket', '⚙️ ตั้งค่าระบบส่งเรื่องร้องเรียน', '📝 แจ้งปัญหาและส่งเรื่องร้องเรียน', 'กดปุ่มด้านล่างเพื่อส่งเรื่องร้องเรียนหรือแจ้งปัญหากับทีมงาน', 'ส่งเรื่องร้องเรียน');
                return await interaction.showModal(modal);
            }

            if (interaction.commandName === 'setup-report') {
                const modal = createSetupModal('modal_config_report', '⚙️ ตั้งค่าระบบรายงานผู้กระทำผิด', '⚠️ รายงานผู้กระทำผิด / สมาชิกทำผิดกฏ', 'หากพบเห็นสมาชิกทำผิดกฏ สามารถกดปุ่มด้านล่างเพื่อแจ้งทีมงานได้ทันที', 'รายงานผู้กระทำผิด');
                return await interaction.showModal(modal);
            }

            if (interaction.commandName === 'setup-admin') {
                const modal = createSetupModal('modal_config_admin', '⚙️ ตั้งค่าแผงควบคุมแอดมิน', '🛠️ แผงควบคุมระบบจัดการผู้ใช้', 'กดปุ่มด้านล่างเพื่อเปิดแบบฟอร์มจัดการและลงโทษผู้กระทำผิด', 'จัดการผู้ใช้');
                return await interaction.showModal(modal);
            }

            if (interaction.commandName === 'setup_dropdown') {
                await interaction.deferReply({ ephemeral: true });

                const messageId = interaction.options.getString('message_id').trim();
                const rawRoleIds = interaction.options.getString('role_ids').split(',').map(id => id.trim()).filter(id => id.length > 0);
                const placeholder = interaction.options.getString('placeholder') || '▼ เลือกยศของคุณที่นี่';
                const imageUrl = interaction.options.getString('image_url')?.trim();

                let targetMessage = interaction.channel.messages.cache.get(messageId);
                if (!targetMessage) {
                    targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
                }

                if (!targetMessage) {
                    return await interaction.editReply({ content: '❌ หาข้อความไม่พบ! กรุณาตรวจสอบ ID ข้อความอีกครั้ง' });
                }

                const validRoles = [];
                for (const id of rawRoleIds) {
                    const role = interaction.guild.roles.cache.get(id);
                    if (role) validRoles.push(role);
                }

                if (validRoles.length === 0) {
                    return await interaction.editReply({ content: '❌ ไม่พบยศที่ระบุในเซิร์ฟเวอร์ กรุณาเช็ก ID ของยศให้ถูกต้อง' });
                }

                const roleChunks = [];
                for (let i = 0; i < validRoles.length; i += 25) {
                    roleChunks.push(validRoles.slice(i, i + 25));
                }

                if (roleChunks.length > 5) {
                    return await interaction.editReply({ content: '⚠️ Discord อนุญาตให้ใส่ Dropdown ได้สูงสุด 5 แถว (125 ยศ) ต่อ 1 ข้อความครับ' });
                }

                const actionRows = [];
                roleChunks.forEach((chunk, index) => {
                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`select_unlimited_roles_${index}`)
                        .setPlaceholder(roleChunks.length > 1 ? `${placeholder} (ชุดที่ ${index + 1})` : placeholder)
                        .setMinValues(0)
                        .setMaxValues(chunk.length)
                        .addOptions(
                            chunk.map(role => 
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(role.name)
                                    .setValue(role.id)
                            )
                        );

                    actionRows.push(new ActionRowBuilder().addComponents(selectMenu));
                });

                let embedsToUse = [...(targetMessage.embeds || [])];
                if (imageUrl && imageUrl.startsWith('http')) {
                    if (embedsToUse.length > 0) {
                        const newEmbed = EmbedBuilder.from(embedsToUse[0]).setImage(imageUrl);
                        embedsToUse[0] = newEmbed;
                    } else {
                        const newEmbed = new EmbedBuilder().setImage(imageUrl);
                        embedsToUse.push(newEmbed);
                    }
                }

                try {
                    if (targetMessage.author.id === client.user.id) {
                        await targetMessage.edit({ embeds: embedsToUse, components: actionRows });
                        return await interaction.editReply({ content: `✅ อัปเดต Dropdown เลือกยศรวม **${validRoles.length}** ยศ ใส่ข้อความเดิมเรียบร้อยแล้ว!` });
                    } else {
                        const payload = {
                            content: targetMessage.content || null,
                            embeds: embedsToUse,
                            files: Array.from(targetMessage.attachments.values()),
                            components: actionRows
                        };

                        await targetMessage.channel.send(payload);
                        return await interaction.editReply({ content: `✅ สร้างข้อความใหม่พร้อมแนบ Dropdown รวม **${validRoles.length}** ยศ เรียบร้อย!` });
                    }
                } catch (err) {
                    console.error('Dropdown Setup Error:', err);
                    return await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการใส่ Dropdown กรุณาตรวจสอบสิทธิ์บอท' });
                }
            }

            // 🌟 HANDLER: ประกาศเปิดรับสมัครทีมงาน (พร้อมเลือกห้อง และตั้งกำหนดการปิดรับ)
            if (interaction.commandName === 'setup-staff-apply') {
                await interaction.deferReply({ ephemeral: true });

                const targetChannel = interaction.options.getChannel('channel');
                const rawPositions = interaction.options.getString('positions').split(',').map(p => p.trim());
                const rawRoles = interaction.options.getString('roles').split(',').map(r => r.trim());
                const endDateStr = interaction.options.getString('end_date').trim(); // รูปแบบ DD/MM/YYYY
                const title = interaction.options.getString('title') || '📢 ประกาศเปิดรับสมัครทีมงานใหม่';
                const description = interaction.options.getString('description') || 'หากคุณมีความสนใจอยากเข้ามาเป็นส่วนหนึ่งในการดูแลเซิร์ฟเวอร์ สามารถกดปุ่มด้านล่างเพื่อเลือกตำแหน่งและกรอกใบสมัครได้ทันที!';
                const bannerUrl = interaction.options.getString('banner_url') || null;
                const colorHex = interaction.options.getString('color') || '#2ECC71';

                if (rawPositions.length !== rawRoles.length) {
                    return await interaction.editReply({ content: '❌ จำนวนตำแหน่ง และ ID ยศ ต้องมีจำนวนเท่ากันและตรงกัน!' });
                }

                // แปลงรูปแบบวันที่ DD/MM/YYYY
                const dateParts = endDateStr.split('/');
                if (dateParts.length !== 3) {
                    return await interaction.editReply({ content: '❌ รูปแบบวันที่ปิดรับสมัครไม่ถูกต้อง! กรุณาใช้รูปแบบ DD/MM/YYYY (เช่น 25/12/2026)' });
                }
                const parsedDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T23:59:59`);
                if (isNaN(parsedDate.getTime())) {
                    return await interaction.editReply({ content: '❌ วันที่ปิดรับสมัครไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง' });
                }

                const positionData = rawPositions.map((pos, idx) => ({
                    label: pos,
                    roleId: rawRoles[idx]
                }));

                // บันทึกสถานะการเปิดรับสมัครลงในระบบ
                client.staffApplyConfigs.set(interaction.guild.id, {
                    isOpen: true,
                    endDate: parsedDate,
                    endDateStr: endDateStr,
                    positions: positionData
                });

                const embed = new EmbedBuilder()
                    .setTitle(title)
                    .setDescription(description)
                    .setColor(colorHex)
                    .addFields(
                        { 
                            name: '📌 ตำแหน่งที่เปิดรับสมัคร', 
                            value: positionData.map(p => `• **${p.label}** (<@&${p.roleId}>)`).join('\n'),
                            inline: false
                        },
                        {
                            name: '📅 กำหนดรับสมัครถึงวันที่',
                            value: `\` ${endDateStr} \` (เวลา 23:59 น.)`,
                            inline: false
                        }
                    )
                    .setFooter({ text: `${interaction.guild.name} • Staff Recruitment` })
                    .setTimestamp();

                if (bannerUrl && bannerUrl.startsWith('http')) {
                    embed.setImage(bannerUrl);
                }

                const btn = new ButtonBuilder()
                    .setCustomId('btn_start_staff_apply')
                    .setLabel('📝 กรอกใบสมัครทีมงาน')
                    .setStyle(ButtonStyle.Success);

                await targetChannel.send({
                    embeds: [embed],
                    components: [new ActionRowBuilder().addComponents(btn)]
                });

                return await interaction.editReply({ content: `✅ ส่งประกาศเปิดรับสมัครทีมงานไปยังห้อง <#${targetChannel.id}> เรียบร้อยแล้ว! (รับสมัครถึงวันที่: ${endDateStr})` });
            }

            // 🌟 HANDLER: คำสั่งสั่งปิดรับสมัครล่วงหน้า
            if (interaction.commandName === 'close-staff-apply') {
                await interaction.deferReply({ ephemeral: true });

                const configData = client.staffApplyConfigs.get(interaction.guild.id);
                if (!configData) {
                    return await interaction.editReply({ content: '❌ ยังไม่มีการตั้งค่าการรับสมัครทีมงานในเซิร์ฟเวอร์นี้' });
                }

                configData.isOpen = false;
                client.staffApplyConfigs.set(interaction.guild.id, configData);

                return await interaction.editReply({ content: '🔒 **สั่งปิดรับสมัครทีมงานเรียบร้อยแล้ว!** สมาชิกที่กดสมัครหลังจากนี้จะได้รับแจ้งเตือนว่าปิดรับสมัครแล้ว' });
            }
        }

        // --- BUTTON & MODAL & SELECT MENU HANDLERS ---
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('btn_toggle_role_')) {
                await interaction.deferReply({ ephemeral: true });

                const roleId = interaction.customId.replace('btn_toggle_role_', '');
                const role = interaction.guild.roles.cache.get(roleId);
                const member = interaction.member;

                if (!role) {
                    return await interaction.editReply({ content: '❌ ไม่พบยศนี้ในเซิร์ฟเวอร์ (ยศอาจถูกลบไปแล้ว)' });
                }

                try {
                    const botMember = await interaction.guild.members.fetchMe();
                    if (role.position >= botMember.roles.highest.position) {
                        return await interaction.editReply({ 
                            content: `❌ บอทไม่สามารถมอบยศ **${role.name}** ได้เนื่องจากยศบอทอยู่ต่ำกว่ายศนี้!` 
                        });
                    }

                    if (member.roles.cache.has(role.id)) {
                        await member.roles.remove(role);
                        return await interaction.editReply({ 
                            content: `🔴 ถอดยศ **${role.name}** ออกเรียบร้อยแล้ว!` 
                        });
                    } else {
                        await member.roles.add(role);
                        return await interaction.editReply({ 
                            content: `✅ เพิ่มยศ **${role.name}** ให้คุณเรียบร้อยแล้ว!` 
                        });
                    }
                } catch (err) {
                    console.error('Error toggling button role:', err);
                    return await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการปรับเปลี่ยนยศ' });
                }
            }

            if (interaction.customId === 'btn_cmd_ticket') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_ticket_submit').setTitle('📝 แบบฟอร์มส่งเรื่องร้องเรียน');
                const detailInput = new TextInputBuilder().setCustomId('input_detail').setLabel('รายละเอียดเรื่องที่ต้องการแจ้ง').setPlaceholder('พิมพ์รายละเอียดปัญหา...').setStyle(TextInputStyle.Paragraph).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(detailInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_cmd_report') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_report_submit').setTitle('⚠️ แบบฟอร์มรายงานผู้กระทำผิด');
                const userInput = new TextInputBuilder().setCustomId('report_target_user').setLabel('1. แท็ก / ID ผู้กระทำผิด').setPlaceholder('ใส่ ID หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
                const reasonInput = new TextInputBuilder().setCustomId('report_reason').setLabel('2. เหตุผลที่รายงาน').setStyle(TextInputStyle.Short).setRequired(true);
                const detailInput = new TextInputBuilder().setCustomId('report_detail').setLabel('3. รายละเอียด/หลักฐาน').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(detailInput)
                );
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_cmd_admin') {
                const modal = new ModalBuilder().setCustomId('modal_cmd_admin_submit').setTitle('👤 แบบฟอร์มจัดการผู้ใช้');
                const userInput = new TextInputBuilder().setCustomId('admin_target_user').setLabel('1. แท็ก / ID ผู้ใช้').setPlaceholder('ใส่ ID หรือ @username').setStyle(TextInputStyle.Short).setRequired(true);
                const reasonInput = new TextInputBuilder().setCustomId('admin_reason').setLabel('2. เหตุผลที่รายงาน').setStyle(TextInputStyle.Short).setRequired(true);
                const problemInput = new TextInputBuilder().setCustomId('admin_problem').setLabel('3. ปัญหาที่พบจากผู้ใช้').setStyle(TextInputStyle.Paragraph).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(userInput),
                    new ActionRowBuilder().addComponents(reasonInput),
                    new ActionRowBuilder().addComponents(problemInput)
                );
                return await interaction.showModal(modal);
            }

            // 🌟 ปุ่มเริ่มกรอกใบสมัคร -> ตรวจสอบสถานะวันหมดอายุและสถานะการเปิดรับสมัคร
            if (interaction.customId === 'btn_start_staff_apply') {
                const configData = client.staffApplyConfigs.get(interaction.guild.id);

                // ตรวจสอบว่าระบบปิดรับสมัคร หรือเลยกำหนดเวลาวันที่ปิดรับหรือยัง
                const now = new Date();
                const isClosed = !configData || !configData.isOpen || (configData.endDate && now > configData.endDate);

                if (isClosed) {
                    return await interaction.reply({
                        content: '🔒 **ขออภัย ขณะนี้ระบบปิดรับสมัครทีมงานแล้ว** (หรือหมดระยะเวลาการรับสมัครแล้ว)',
                        ephemeral: true
                    });
                }

                const positions = configData.positions || [];
                if (positions.length === 0) {
                    return await interaction.reply({ content: '❌ ไม่พบข้อมูลตำแหน่งที่เปิดรับสมัคร', ephemeral: true });
                }

                const menu = new StringSelectMenuBuilder()
                    .setCustomId('select_staff_position')
                    .setPlaceholder('▼ เลือกตำแหน่งที่คุณต้องการสมัคร')
                    .addOptions(positions.map((p, index) => new StringSelectMenuOptionBuilder().setLabel(p.label).setValue(`${index}`)));

                return await interaction.reply({
                    content: '📌 กรุณาเลือกตำแหน่งที่ต้องการสมัครจากรายการด้านล่าง:',
                    components: [new ActionRowBuilder().addComponents(menu)],
                    ephemeral: true
                });
            }

            // 🌟 ปุ่มอนุมัติ / ปฏิเสธ การสมัครทีมงาน
            if (interaction.customId.startsWith('staff_pass_') || interaction.customId.startsWith('staff_reject_')) {
                await interaction.deferUpdate();

                const isPass = interaction.customId.startsWith('staff_pass_');
                const targetUserId = interaction.customId.replace(isPass ? 'staff_pass_' : 'staff_reject_', '');
                
                const originalEmbed = interaction.message.embeds[0];
                if (!originalEmbed) return;

                const targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
                
                // ค้นหาตำแหน่งและ Role ID จาก Embed
                const posField = originalEmbed.fields.find(f => f.name.includes('สมัครตำแหน่ง'));
                const posName = posField ? posField.value.replace(/`/g, '').trim() : 'ทีมงาน';
                
                const configData = client.staffApplyConfigs.get(interaction.guild.id);
                const positions = configData ? configData.positions : [];
                const matchedPos = positions.find(p => p.label === posName);

                if (isPass) {
                    if (targetMember && matchedPos && matchedPos.roleId) {
                        await targetMember.roles.add(matchedPos.roleId).catch(() => null);
                    }

                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor(0x2ECC71)
                        .setTitle(`✅ [ผ่านการคัดเลือก] ใบสมัครทีมงาน`)
                        .addFields({ name: '👤 ดำเนินการโดย', value: `<@${interaction.user.id}>` });

                    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                    if (targetMember) {
                        await targetMember.send(`🎉 **ยินดีด้วยครับ!** ใบสมัครทีมงานตำแหน่ง **${posName}** ในเซิร์ฟเวอร์ **${interaction.guild.name}** ของคุณได้รับการ **อนุมัติ** เรียบร้อยแล้ว!`).catch(() => null);
                    }
                } else {
                    const updatedEmbed = EmbedBuilder.from(originalEmbed)
                        .setColor(0xED4245)
                        .setTitle(`❌ [ไม่ผ่านการคัดเลือก] ใบสมัครทีมงาน`)
                        .addFields({ name: '👤 ดำเนินการโดย', value: `<@${interaction.user.id}>` });

                    await interaction.message.edit({ embeds: [updatedEmbed], components: [] });

                    // แจ้งผู้สมัครด้วยข้อความในห้องสมัคร
                    const applyChan = interaction.channel;
                    if (applyChan) {
                        await applyChan.send({
                            content: `📢 <@${targetUserId}> เสียใจด้วยครับ ผลการสมัครทีมงานตำแหน่ง **${posName}** ของคุณ **ไม่ผ่านการคัดเลือก** ในครั้งนี้`,
                            allowedMentions: { users: [targetUserId] }
                        }).catch(() => null);
                    }
                }
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('modal_config_')) {
                await interaction.deferReply({ ephemeral: true });

                const title = interaction.fields.getTextInputValue('cfg_title');
                const desc = interaction.fields.getTextInputValue('cfg_desc');
                const btnLabel = interaction.fields.getTextInputValue('cfg_btn_label');
                const imageUrl = interaction.fields.getTextInputValue('cfg_image_url');

                let customIdBtn = 'btn_cmd_ticket';
                let btnStyle = ButtonStyle.Primary;
                let emoji = '📝';
                let color = 0xED4245;

                if (interaction.customId === 'modal_config_report') {
                    customIdBtn = 'btn_cmd_report';
                    btnStyle = ButtonStyle.Warning;
                    emoji = '⚠️';
                    color = 0xFEE75C;
                } else if (interaction.customId === 'modal_config_admin') {
                    customIdBtn = 'btn_cmd_admin';
                    btnStyle = ButtonStyle.Danger;
                    emoji = '👤';
                    color = 0x5865F2;
                }

                const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setTimestamp();
                if (imageUrl && imageUrl.startsWith('http')) embed.setImage(imageUrl);

                const btn = new ButtonBuilder().setCustomId(customIdBtn).setLabel(btnLabel).setEmoji(emoji).setStyle(btnStyle);

                await interaction.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(btn)] });
                return await interaction.editReply({ content: '✅ สร้างระบบพร้อมใช้งานเรียบร้อยแล้ว!' });
            }

            if (interaction.customId === 'modal_cmd_ticket_submit') {
                await interaction.deferReply({ ephemeral: true });

                const detailVal = interaction.fields.getTextInputValue('input_detail');
                const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

                const embed = new EmbedBuilder()
                    .setTitle(`🚨 เรื่องร้องเรียนจาก ${interaction.user.username}`)
                    .setColor(0xED4245)
                    .addFields(
                        { name: 'ผู้ส่งเรื่อง', value: `<@${interaction.user.id}>`, inline: false },
                        { name: 'รายละเอียด', value: detailVal, inline: false }
                    ).setTimestamp();

                if (reportChannel) await reportChannel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✅ ส่งข้อมูลให้ทีมงานเรียบร้อยแล้ว!' });
            }

            if (interaction.customId === 'modal_cmd_report_submit') {
                await interaction.deferReply({ ephemeral: true });

                const targetUser = interaction.fields.getTextInputValue('report_target_user');
                const reason = interaction.fields.getTextInputValue('report_reason');
                const detail = interaction.fields.getTextInputValue('report_detail');
                const reportChannel = interaction.guild.channels.cache.get(REPORT_LOG_CHANNEL_ID);

                const embed = new EmbedBuilder()
                    .setTitle(`⚠️ รายงานผู้กระทำผิด`)
                    .setColor(0xFEE75C)
                    .addFields(
                        { name: 'ผู้ส่งรายงาน', value: `<@${interaction.user.id}>`, inline: false },
                        { name: 'ผู้ถูกรายงาน', value: targetUser, inline: false },
                        { name: 'เหตุผล', value: reason, inline: false },
                        { name: 'รายละเอียด', value: detail, inline: false }
                    ).setTimestamp();

                if (reportChannel) await reportChannel.send({ embeds: [embed] });
                return await interaction.editReply({ content: '✅ ส่งรายงานให้ทีมงานเรียบร้อยแล้ว!' });
            }

            if (interaction.customId === 'modal_cmd_admin_submit') {
                await interaction.deferReply({ ephemeral: true });

                const rawUser = interaction.fields.getTextInputValue('admin_target_user').replace(/[<@!>]/g, '').trim();
                const reason = interaction.fields.getTextInputValue('admin_reason');
                const problem = interaction.fields.getTextInputValue('admin_problem');

                const targetMember = await interaction.guild.members.fetch(rawUser).catch(() => null);
                if (!targetMember) return interaction.editReply({ content: '❌ ไม่พบผู้ใช้คนนี้ในเซิร์ฟเวอร์' });

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`menu_admin_penalty_${targetMember.id}`)
                    .setPlaceholder('เลือกลงบัญชี (แบน & ลงบัญชีดำ)')
                    .addOptions([
                        { label: '⛔ ลงบัญชีดำ (Blacklist)', description: 'เตะออกจากเซิร์ฟเวอร์ + ประกาศห้องบัญชีดำ', value: 'admin_penalty_blacklist', emoji: '⛔' },
                        { label: '🔨 แบน (Ban / Timeout)', description: 'ให้ยศ "บัญชีถูกแบน" + กำหนดเวลา', value: 'admin_penalty_ban', emoji: '🔨' }
                    ]);

                client.adminTempData = client.adminTempData || new Map();
                client.adminTempData.set(targetMember.id, { reason, problem });

                return await interaction.editReply({
                    content: `🎯 **ผู้ถูกจัดการ:** <@${targetMember.id}>\n📝 **เหตุผล:** ${reason}\n⚠️ **ปัญหา:** ${problem}\n\n👇 **เลือกลงโทษ:**`,
                    components: [new ActionRowBuilder().addComponents(selectMenu)]
                });
            }

            if (interaction.customId.startsWith('modal_admin_ban_time_')) {
                await interaction.deferReply({ ephemeral: true });

                const targetId = interaction.customId.replace('modal_admin_ban_time_', '');
                const durationStr = interaction.fields.getTextInputValue('ban_duration');
                const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

                if (!targetMember) return interaction.editReply({ content: '❌ ไม่พบผู้ใช้คนนี้แล้ว' });

                if (BANNED_ROLE_ID) await targetMember.roles.add(BANNED_ROLE_ID).catch(() => null);

                let ms = 0;
                if (durationStr.endsWith('d')) ms = parseInt(durationStr) * 24 * 60 * 60 * 1000;
                else if (durationStr.endsWith('h')) ms = parseInt(durationStr) * 60 * 60 * 1000;
                else if (durationStr.endsWith('m')) ms = parseInt(durationStr) * 60 * 1000;

                if (ms > 0) await targetMember.timeout(ms, tempData.reason).catch(() => null);

                const banLogChan = interaction.guild.channels.cache.get(BAN_LOG_CHANNEL_ID || REPORT_LOG_CHANNEL_ID);
                const banEmbed = new EmbedBuilder()
                    .setTitle('🔨 ประกาศสมาชิกโดนแบน')
                    .setColor(0xFF0000)
                    .addFields(
                        { name: 'ผู้ถูกลงโทษ', value: `<@${targetMember.id}>`, inline: false },
                        { name: 'ระยะเวลา', value: durationStr, inline: true },
                        { name: 'เหตุผล', value: tempData.reason, inline: true },
                        { name: 'ปัญหาที่พบ', value: tempData.problem, inline: false },
                        { name: 'ผู้อนุมัติ', value: `<@${interaction.user.id}>`, inline: false }
                    ).setThumbnail(targetMember.user.displayAvatarURL()).setTimestamp();

                if (banLogChan) await banLogChan.send({ embeds: [banEmbed] });
                return await interaction.editReply({ content: `✅ ดำเนินการแบน <@${targetId}> ระยะเวลา \`${durationStr}\` เรียบร้อย!` });
            }

            // 🌟 บันทึกแบบฟอร์มสมัครทีมงาน -> ส่งเข้าห้องตรวจ
            if (interaction.customId.startsWith('modal_staff_submit_')) {
                await interaction.deferReply({ ephemeral: true });

                const posIndex = parseInt(interaction.customId.replace('modal_staff_submit_', ''));
                const configData = client.staffApplyConfigs.get(interaction.guild.id);
                const positions = configData ? configData.positions : [];
                const targetPos = positions[posIndex] || { label: 'ไม่ได้ระบุ', roleId: null };

                const nickname = interaction.fields.getTextInputValue('st_nickname');
                const age = interaction.fields.getTextInputValue('st_age');
                const workTime = interaction.fields.getTextInputValue('st_worktime');
                const workDays = interaction.fields.getTextInputValue('st_workdays');
                const duration = interaction.fields.getTextInputValue('st_duration');

                const logChan = interaction.guild.channels.cache.get(STAFF_LOG_CHANNEL_ID);

                // 🎨 Embed สวยๆ จัดระเบียบเว้นวรรคชัดเจน
                const embed = new EmbedBuilder()
                    .setTitle(`📥 ใบสมัครทีมงานใหม่: ${interaction.user.username}`)
                    .setColor(0x3498DB)
                    .addFields(
                        { name: '👤 ผู้สมัคร', value: `<@${interaction.user.id}>\n\`(ID: ${interaction.user.id})\``, inline: false },
                        { name: '💼 สมัครตำแหน่ง', value: `\` ${targetPos.label} \``, inline: false },
                        { name: '1️⃣ ชื่อเล่น', value: nickname, inline: true },
                        { name: '2️⃣ อายุ', value: `${age} ปี`, inline: true },
                        { name: '\u200B', value: '\u200B', inline: true },
                        { name: '3️⃣ เวลาปฏิบัติงาน', value: workTime, inline: false },
                        { name: '4️⃣ วันที่จะปฏิบัติงาน', value: workDays, inline: false },
                        { name: '5️⃣ ระยะเวลาปฏิบัติงาน', value: duration, inline: false }
                    )
                    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                    .setFooter({ text: 'สถานะ: รอการตรวจสอบ' })
                    .setTimestamp();

                const actionRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`staff_pass_${interaction.user.id}`).setLabel('✅ อนุมัติ (Pass)').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId(`staff_reject_${interaction.user.id}`).setLabel('❌ ไม่ผ่าน (Reject)').setStyle(ButtonStyle.Danger)
                );

                if (logChan) {
                    await logChan.send({ embeds: [embed], components: [actionRow] });
                }

                return await interaction.editReply({ content: '✅ ส่งใบสมัครทีมงานเรียบร้อยแล้ว! กรุณารอทีมงานตรวจสอบข้อมูลครับ' });
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId.startsWith('menu_admin_penalty_')) {
                const targetId = interaction.customId.replace('menu_admin_penalty_', '');
                const selectedOption = interaction.values[0];
                const tempData = client.adminTempData?.get(targetId) || { reason: 'ไม่ได้ระบุ', problem: 'ไม่ได้ระบุ' };
                const targetMember = await interaction.guild.members.fetch(targetId).catch(() => null);

                if (!targetMember) return interaction.update({ content: '❌ ไม่พบผู้ใช้คนนี้แล้ว', components: [] });

                if (selectedOption === 'admin_penalty_blacklist') {
                    const blacklistChan = interaction.guild.channels.cache.get(BLACKLIST_CHANNEL_ID);
                    const blacklistEmbed = new EmbedBuilder()
                        .setTitle('⛔ ประกาศรายชื่อบัญชีดำ (Blacklist)')
                        .setColor(0x000000)
                        .addFields(
                            { name: 'ผู้ถูกบันทึก', value: `${targetMember.user.tag} (${targetMember.id})`, inline: false },
                            { name: 'เหตุผล', value: tempData.reason, inline: false },
                            { name: 'ปัญหาที่พบ', value: tempData.problem, inline: false },
                            { name: 'โดยแอดมิน', value: `<@${interaction.user.id}>`, inline: false }
                        ).setThumbnail(targetMember.user.displayAvatarURL()).setTimestamp();

                    if (blacklistChan) await blacklistChan.send({ embeds: [blacklistEmbed] });
                    await targetMember.kick(`[Blacklist] ${tempData.reason}`).catch(() => null);

                    return await interaction.update({ content: `⛔ บันทึก <@${targetId}> ลงบัญชีดำและเตะออกเรียบร้อย!`, components: [] });
                }

                if (selectedOption === 'admin_penalty_ban') {
                    const modal = new ModalBuilder().setCustomId(`modal_admin_ban_time_${targetId}`).setTitle('⏱️ กำหนดระยะเวลาการแบน');
                    const durationInput = new TextInputBuilder().setCustomId('ban_duration').setLabel('ระบุระยะเวลา (เช่น 1d = 1วัน, 12h = 12ชม.)').setPlaceholder('ตัวอย่าง: 7d หรือ 24h').setStyle(TextInputStyle.Short).setRequired(true);

                    modal.addComponents(new ActionRowBuilder().addComponents(durationInput));
                    return await interaction.showModal(modal);
                }
            }

            if (interaction.customId.startsWith('select_unlimited_roles_')) {
                await interaction.deferReply({ ephemeral: true });

                const selectedRoleIds = interaction.values;
                const member = interaction.member;
                const allMenuRoleIds = interaction.component.options.map(opt => opt.value);

                try {
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
                } catch (error) {
                    console.error(error);
                    return await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดในการปรับเปลี่ยนยศ' });
                }
            }

            // 🌟 เมื่อเลือกตำแหน่งจาก Dropdown -> เปิด Modal กรอกใบสมัครพร้อม Index ตำแหน่ง
            if (interaction.customId === 'select_staff_position') {
                const selectedPosIndex = interaction.values[0];

                const modal = new ModalBuilder()
                    .setCustomId(`modal_staff_submit_${selectedPosIndex}`)
                    .setTitle('📝 แบบฟอร์มใบสมัครทีมงาน');

                const nameInput = new TextInputBuilder().setCustomId('st_nickname').setLabel('1. ชื่อเล่น').setPlaceholder('เช่น แฮมสเตอร์').setStyle(TextInputStyle.Short).setRequired(true);
                const ageInput = new TextInputBuilder().setCustomId('st_age').setLabel('2. อายุ').setPlaceholder('เช่น 19').setStyle(TextInputStyle.Short).setRequired(true);
                const timeInput = new TextInputBuilder().setCustomId('st_worktime').setLabel('3. เวลาปฏิบัติงาน').setPlaceholder('เช่น 08:00 - 22:00').setStyle(TextInputStyle.Short).setRequired(true);
                const daysInput = new TextInputBuilder().setCustomId('st_workdays').setLabel('4. วันที่จะปฏิบัติงาน').setPlaceholder('เช่น ทุกวัน').setStyle(TextInputStyle.Short).setRequired(true);
                const durInput = new TextInputBuilder().setCustomId('st_duration').setLabel('5. ระยะเวลาปฏิบัติงาน').setPlaceholder('เช่น ตลอดไป').setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(nameInput),
                    new ActionRowBuilder().addComponents(ageInput),
                    new ActionRowBuilder().addComponents(timeInput),
                    new ActionRowBuilder().addComponents(daysInput),
                    new ActionRowBuilder().addComponents(durInput)
                );

                return await interaction.showModal(modal);
            }
        }
    } catch (err) {
        console.error('Interaction Exception:', err);
    }
});

// 🌟 ระบบตรวจจับสมาชิกใหม่เข้าดิส (WELCOME AUTOMATION)
client.on('guildMemberAdd', async (member) => {
    try {
        const welcomeConfig = client.welcomeConfigs.get(member.guild.id) || {
            channelId: process.env.WELCOME_CHANNEL_ID,
            title: '🎉 ยินดีต้อนรับสู่ {guild}!',
            description: '👋 ยินดีต้อนรับคุณ {user} เข้าสู่เซิร์ฟเวอร์ **{guild}** ครับ!\n\nขณะนี้เซิร์ฟเวอร์ของเรามีสมาชิกทั้งหมด **{memberCount}** คนแล้ว ✨\nขอให้สนุกกับการอยู่ร่วมกันนะครับ!',
            contentMessage: '✨ ยินดีต้อนรับ {user} สู่เซิร์ฟเวอร์ของเรา!',
            bannerUrl: null,
            color: '#5865F2'
        };

        if (!welcomeConfig.channelId) return;

        const welcomeChannel = member.guild.channels.cache.get(welcomeConfig.channelId);
        if (!welcomeChannel) return;

        const guild = member.guild;

        const formattedTitle = parseCustomTags(welcomeConfig.title, guild, member);
        const formattedDesc = parseCustomTags(welcomeConfig.description, guild, member);
        const formattedContent = parseCustomTags(welcomeConfig.contentMessage, guild, member);

        const welcomeEmbed = new EmbedBuilder()
            .setTitle(formattedTitle)
            .setColor(welcomeConfig.color || '#5865F2')
            .setDescription(formattedDesc)
            .addFields(
                { name: '👤 สมาชิกใหม่', value: `<@${member.id}>`, inline: true },
                { name: '📊 ลำดับสมาชิก', value: `คนที่ \`${guild.memberCount}\``, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `${guild.name} • ยินดีต้อนรับนะ 🎉` })
            .setTimestamp();

        if (welcomeConfig.bannerUrl && welcomeConfig.bannerUrl.startsWith('http')) {
            welcomeEmbed.setImage(welcomeConfig.bannerUrl);
        }

        await welcomeChannel.send({
            content: formattedContent,
            embeds: [welcomeEmbed]
        }).catch(err => console.error('ส่งข้อความ Welcome ล้มเหลว:', err));

    } catch (error) {
        console.error('❌ Error in guildMemberAdd:', error);
    }
});

// 🚀 ระบบตรวจจับ Boost จริง
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    const oldBoost = oldMember.premiumSince;
    const newBoost = newMember.premiumSince;

    if (!oldBoost && newBoost) {
        const boostConfig = client.boostConfigs.get(newMember.guild.id) || {
            channelId: process.env.BOOST_LOG_CHANNEL_ID,
            title: '🚀 ขอบคุณสำหรับการ Server Boost!',
            description: '💖 ขอบคุณคุณ {user} มากๆ นะครับที่ช่วยสนับสนุนเซิร์ฟเวอร์ **{guild}**!\n\nแวะไปคุยกันได้ที่ห้อง {#พูดคุย-ทั่วไป} ได้เลยครับ ✨',
            contentMessage: '🎉 **NEW BOOST!** ขอบคุณ {user} มากๆ ครับ! 🚀✨',
            bannerUrl: null,
            color: '#F47FFF'
        };

        if (!boostConfig.channelId) return;

        const boostChannel = newMember.guild.channels.cache.get(boostConfig.channelId);
        if (!boostChannel) return;

        const guild = newMember.guild;

        const formattedTitle = parseCustomTags(boostConfig.title, guild, newMember);
        const formattedDesc = parseCustomTags(boostConfig.description, guild, newMember);
        const formattedContent = parseCustomTags(boostConfig.contentMessage, guild, newMember);

        const boostEmbed = new EmbedBuilder()
            .setTitle(formattedTitle)
            .setColor(boostConfig.color || '#F47FFF')
            .setDescription(formattedDesc)
            .addFields(
                { name: '👤 ผู้สนับสนุน (Booster)', value: `<@${newMember.id}>`, inline: true },
                { name: '💎 ยอด Boost รวม', value: `\`${guild.premiumSubscriptionCount || 0}\` บูสต์`, inline: true },
                { name: '⭐ Server Level', value: `\`Level ${guild.premiumTier}\``, inline: true }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
            .setFooter({ text: `${guild.name} • ขอบคุณสำหรับการสนับสนุน 💖` })
            .setTimestamp();

        if (boostConfig.bannerUrl && boostConfig.bannerUrl.startsWith('http')) {
            boostEmbed.setImage(boostConfig.bannerUrl);
        }

        await boostChannel.send({
            content: formattedContent,
            embeds: [boostEmbed]
        }).catch(err => console.error('ส่งข้อความ Boost ล้มเหลว:', err));
    }
});

// 🔴 ระบบพิมพ์จุด (.) รับยศ & คำสั่ง !status
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const config = client.dotRoleConfigs.get(message.channel.id);
    if (config) {
        const roleId = typeof config === 'string' ? config : config.roleId;

        if (message.content.trim() === '.') {
            try {
                const role = message.guild.roles.cache.get(roleId);
                if (!role) return;

                if (message.member.roles.cache.has(roleId)) {
                    await message.react('⚠️').catch(() => null);
                    
                    const warnMsg = await message.channel.send({
                        content: `⚠️ <@${message.author.id}> คุณมียศ **${role.name}** อยู่แล้วครับ!`
                    });
                    
                    setTimeout(() => {
                        warnMsg.delete().catch(() => null);
                    }, 4000);
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
                });

            } catch (error) {
                console.error('❌ เกิดข้อผิดพลาดในการมอบยศ:', error);
            }
        }
    }

    if (message.content.startsWith('!status')) {
        const COMMAND_CHANNEL_ID = process.env.COMMAND_CHANNEL_ID;
        const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

        if (COMMAND_CHANNEL_ID && message.channel.id !== COMMAND_CHANNEL_ID) {
            return message.reply(`⚠️ คำสั่งนี้ใช้ได้เฉพาะในห้องสั่งการ <#${COMMAND_CHANNEL_ID}> เท่านั้นครับ!`)
                .then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
        }

        if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            return message.reply('❌ คุณไม่มีสิทธิ์ใช้คำสั่งนี้');
        }

        const waitMsg = await message.reply('🔄 กำลังประมวลผลและรวบรวมรายชื่อสมาชิกที่ไม่เคลื่อนไหว...');

        try {
            const guild = message.guild;
            await guild.members.fetch();

            const now = Date.now();
            const members = guild.members.cache.filter(m => !m.user.bot);

            const inactive30Days = [];
            const inactive90Days = [];
            const noRoleList = [];

            members.forEach(member => {
                if (member.roles.cache.size <= 1) {
                    noRoleList.push(`<@${member.id}>`);
                }

                if (!member.joinedTimestamp) return;
                const daysInServer = Math.floor((now - member.joinedTimestamp) / (1000 * 60 * 60 * 24));

                if (daysInServer >= 90) {
                    inactive90Days.push(`<@${member.id}> (${daysInServer} วัน)`);
                } else if (daysInServer >= 30) {
                    inactive30Days.push(`<@${member.id}> (${daysInServer} วัน)`);
                }
            });

            const formatList = (arr) => {
                if (arr.length === 0) return 'ไม่มี';
                const text = arr.join('\n');
                return text.length > 1024 ? text.substring(0, 1000) + '\n...และอื่นๆ อีกหลายคน' : text;
            };

            const embed = new EmbedBuilder()
                .setTitle(`🚨 [รายชื่อสมาชิกสำหรับคัดออก] - ${guild.name}`)
                .setColor(0xE74C3C)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .setDescription(`📊 **สมาชิกคนจริงทั้งหมด:** \`${members.size}\` คน`)
                .addFields(
                    { name: `❓ ไม่มี Role ใดๆ (${noRoleList.length} คน)`, value: formatList(noRoleList), inline: false },
                    { name: `🗓️ อยู่มาเกิน 3 เดือน / 90+ วัน (${inactive90Days.length} คน)`, value: formatList(inactive90Days), inline: false },
                    { name: `📅 อยู่มาเกิน 1 เดือน / 30+ วัน (${inactive30Days.length} คน)`, value: formatList(inactive30Days), inline: false }
                )
                .setFooter({ text: `คำสั่งโดย: ${message.author.tag}` })
                .setTimestamp();

            const logChannel = LOG_CHANNEL_ID ? guild.channels.cache.get(LOG_CHANNEL_ID) : null;

            if (logChannel) {
                await logChannel.send({ embeds: [embed] });
                await waitMsg.edit(`✅ ส่งรายชื่อและผลการตรวจสอบไปที่ห้องปฏิบัติการ <#${LOG_CHANNEL_ID}> เรียบร้อยแล้ว!`);
            } else {
                await waitMsg.edit({ content: '⚠️ ไม่พบการตั้งค่า `LOG_CHANNEL_ID` ผลลัพธ์จึงแสดงในห้องนี้:', embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in !status command:', error);
            await waitMsg.edit('❌ เกิดข้อผิดพลาดขณะประมวลผลข้อมูล');
        }
    }
});

client.login(TOKEN);
