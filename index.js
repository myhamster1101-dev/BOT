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
client.userBalances = client.userBalances || new Map();
client.shopItems = client.shopItems || new Map();
client.shopLogsConfig = client.shopLogsConfig || new Map();
client.shopMessageConfigs = client.shopMessageConfigs || new Map();

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

    let decorateStockCount = 0;
    let otherStockCount = 0;
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
        summaryText = `📊 **สรุปจำนวนรายการยศที่พร้อมจำหน่าย:**\n🎨 **ยศตกแต่ง:** ${decorateStockCount} รายการ\n⭐ **ยศอื่นๆ:** ${otherStockCount} รายการ`;
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

// 📌 Slash Commands
const commands = [
    new SlashCommandBuilder()
        .setName('setup-dot-role')
        .setDescription('ตั้งค่าห้องและยศสำหรับระบบพิมพ์จุด (.) รับยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้อง').setRequired(true))
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศ').setRequired(true))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์รูป Banner').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('add-shop-item')
        .setDescription('เพิ่ม/แก้ไขยศขายในร้านค้า')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addRoleOption(opt => opt.setName('role').setDescription('เลือกยศ').setRequired(true))
        .addIntegerOption(opt => opt.setName('price').setDescription('กำหนดราคา (บาท)').setRequired(true))
        .addIntegerOption(opt => opt.setName('stock').setDescription('จำนวนคงเหลือ').setRequired(false))
        .addStringOption(opt => opt.setName('category').setDescription('จำแนกประเภท')
            .setRequired(false)
            .addChoices(
                { name: '🎨 ยศตกแต่ง', value: 'ยศตกแต่ง' },
                { name: '⭐ ยศอื่นๆ', value: 'ยศอื่นๆ' }
            ))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบาย').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop-logs')
        .setDescription('ตั้งค่าห้อง Logs และบัญชีรับเงิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('topup_log').setDescription('ห้อง Log เติมเงิน').setRequired(true))
        .addChannelOption(opt => opt.setName('shop_log').setDescription('ห้อง Log ซื้อขาย').setRequired(true))
        .addStringOption(opt => opt.setName('account_name').setDescription('ชื่อบัญชีผู้รับเงิน').setRequired(false))
        .addStringOption(opt => opt.setName('truewallet').setDescription('เบอร์ TrueMoney Wallet').setRequired(false))
        .addStringOption(opt => opt.setName('promptpay').setDescription('เบอร์ พร้อมเพย์/เลขบัญชี').setRequired(false))
        .addStringOption(opt => opt.setName('qr_code_url').setDescription('ลิงก์รูป QR Code').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-shop')
        .setDescription('สร้างหน้าร้านค้าขายยศ')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องส่งหน้าร้าน').setRequired(true))
        .addStringOption(opt => opt.setName('title').setDescription('หัวข้อ Embed').setRequired(false))
        .addStringOption(opt => opt.setName('description').setDescription('คำอธิบาย').setRequired(false))
        .addStringOption(opt => opt.setName('banner_url').setDescription('ลิงก์ Banner').setRequired(false))
        .addStringOption(opt => opt.setName('color').setDescription('โค้ดสี HEX').setRequired(false)),

    new SlashCommandBuilder()
        .setName('setup-admin-give-money')
        .setDescription('แผงควบคุมเสกเงินสำหรับแอดมิน')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(opt => opt.setName('channel').setDescription('เลือกห้องแอดมิน').setRequired(true))
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

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'setup-shop') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');
                if (!targetChannel || !targetChannel.isTextBased()) {
                    return await interaction.editReply({ content: '❌ กรุณาเลือกห้องข้อความที่ถูกต้อง' });
                }

                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'ยินดีต้อนรับคุณ {user} เลือกซื้อยศที่ต้องการ หรือกดปุ่มเติมเงินด้านล่าง!';
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
                    topupLogId: topupLog.id, shopLogId: shopLog.id, accountName, truewallet, promptpay, qrCodeUrl
                });

                return await interaction.editReply({ content: `✅ **ตั้งค่าระบบรับเงินและบันทึก Logs สำเร็จ!**` });
            }

            if (interaction.commandName === 'setup-admin-give-money') {
                await interaction.deferReply({ ephemeral: true });
                const targetChannel = interaction.options.getChannel('channel');

                const adminEmbed = new EmbedBuilder()
                    .setTitle('🪄 แผงควบคุมเสกเงิน (Admin Balance Controller)')
                    .setColor(0x9B59B6)
                    .setDescription('กดปุ่มด้านล่างเพื่อเพิ่มยอดเงินให้สมาชิก')
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_admin_give_money').setLabel('🪄 เสกเงิน / เพิ่มเครดิต').setStyle(ButtonStyle.Danger)
                );

                await targetChannel.send({ embeds: [adminEmbed], components: [btnRow] });
                return await interaction.editReply({ content: `✅ สร้างปุ่มแผงเสกเงินเรียบร้อยแล้ว!` });
            }
        }

        if (interaction.isButton()) {
            if (interaction.customId === 'btn_check_balance') {
                const bal = client.userBalances.get(interaction.user.id) || 0;
                return await interaction.reply({ content: `💰 ยอดเงินคงเหลือของคุณคือ **${bal}** บาท`, ephemeral: true });
            }

            if (interaction.customId === 'btn_admin_give_money') {
                if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
                    return await interaction.reply({ content: '❌ คุณไม่มีสิทธิ์ใช้งานปุ่มนี้', ephemeral: true });
                }

                const modal = new ModalBuilder().setCustomId('modal_admin_give_money').setTitle('🪄 ระบบเสกเงิน/เพิ่มเครดิต');
                const userIdInput = new TextInputBuilder().setCustomId('input_target_user_id').setLabel('User ID ผู้รับเงิน').setValue(interaction.user.id).setStyle(TextInputStyle.Short).setRequired(true);
                const amountInput = new TextInputBuilder().setCustomId('input_give_amount').setLabel('จำนวนเงิน (บาท)').setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(userIdInput), new ActionRowBuilder().addComponents(amountInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_truemoney') {
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงิน TrueMoney Wallet');
                const voucherInput = new TextInputBuilder().setCustomId('input_voucher_url').setLabel(`วางลิงก์ซองของขวัญที่นี่`).setStyle(TextInputStyle.Short).setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(voucherInput));
                return await interaction.showModal(modal);
            }

            if (interaction.customId === 'btn_topup_promptpay') {
                const logsCfg = client.shopLogsConfig.get(interaction.guild.id);
                const ppEmbed = new EmbedBuilder()
                    .setTitle('📲 เติมเงินผ่าน PromptPay / QR Code')
                    .setColor(0x3498DB)
                    .setDescription(`👤 **ชื่อบัญชี:** \`${logsCfg?.accountName || 'กรุณาสอบถามแอดมิน'}\`\n💳 **เลขบัญชี/พร้อมเพย์:** \`${logsCfg?.promptpay || 'กรุณาสอบถามแอดมิน'}\``)
                    .setTimestamp();

                if (logsCfg?.qrCodeUrl && logsCfg.qrCodeUrl.startsWith('http')) ppEmbed.setImage(logsCfg.qrCodeUrl);
                return await interaction.reply({ embeds: [ppEmbed], ephemeral: true });
            }
        }

        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_buy_shop_role') {
                await interaction.deferReply({ ephemeral: true });
                const selectedRoleId = interaction.values[0];
                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const itemIndex = guildItems.findIndex(i => i.roleId === selectedRoleId);

                if (itemIndex === -1) return await interaction.editReply({ content: '❌ ไม่พบสินค้ายศนี้ในร้านค้า' });

                const item = guildItems[itemIndex];
                const userBalance = client.userBalances.get(interaction.user.id) || 0;

                if (userBalance < item.price) return await interaction.editReply({ content: `❌ **ยอดเงินของคุณไม่พอ!** ยศนี้ราคา **${item.price}** บาท คุณมี **${userBalance}** บาท` });
                if (item.stock <= 0) return await interaction.editReply({ content: '❌ สินค้ายศนี้หมดแล้ว' });

                const targetRole = interaction.guild.roles.cache.get(item.roleId);
                if (!targetRole) return await interaction.editReply({ content: '❌ ยศนี้ไม่มีอยู่ในเซิร์ฟเวอร์แล้ว' });

                client.userBalances.set(interaction.user.id, userBalance - item.price);
                guildItems[itemIndex].stock -= 1;
                client.shopItems.set(interaction.guild.id, guildItems);

                await interaction.member.roles.add(targetRole).catch(() => null);
                await updateShopDisplay(interaction.guild);

                return await interaction.editReply({ content: `🎉 **สั่งซื้อสำเร็จ!** คุณได้รับยศ **${targetRole.name}** เรียบร้อยแล้ว` });
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'modal_admin_give_money') {
                await interaction.deferReply({ ephemeral: true });
                const targetUserId = interaction.fields.getTextInputValue('input_target_user_id').trim();
                const amount = parseInt(interaction.fields.getTextInputValue('input_give_amount').trim(), 10);

                if (isNaN(amount) || amount <= 0) return await interaction.editReply({ content: '❌ กรุณากรอกตัวเลขที่มากกว่า 0' });

                const newBal = (client.userBalances.get(targetUserId) || 0) + amount;
                client.userBalances.set(targetUserId, newBal);

                return await interaction.editReply({ content: `🪄 **เสกเงินสำเร็จ!** เพิ่มเงิน **${amount}** บาท ให้ผู้ใช้ <@${targetUserId}> เรียบร้อยแล้ว (รวม: **${newBal}** บาท)` });
            }

            if (interaction.customId === 'modal_topup_truemoney') {
                await interaction.deferReply({ ephemeral: true });
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_url').trim();
                return await interaction.editReply({ content: `📩 **รับข้อมูลลิงก์ซองของขวัญเรียบร้อยแล้ว!**\n\`${voucherUrl}\`` });
            }
        }
    } catch (err) {
        console.error('Error:', err);
    }
});

client.login(TOKEN);
