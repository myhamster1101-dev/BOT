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
        GatewayIntentBits.MessageContent
    ]
});

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;

// 🟢 Global State Storage
client.dotRoleConfigs = client.dotRoleConfigs || new Map();
client.userBalances = client.userBalances || new Map();
client.shopItems = client.shopItems || new Map();
client.shopLogsConfig = client.shopLogsConfig || new Map();
client.shopMessageConfigs = client.shopMessageConfigs || new Map();

// 🛠️ Safe Tag Parser
function parseCustomTags(text, guild, member) {
    if (!text || typeof text !== 'string') return '';
    let parsed = text;
    try {
        if (member) {
            parsed = parsed.replace(/\{user\}/g, `<@${member.id}>`);
            parsed = parsed.replace(/\{username\}/g, member.user?.username || member.displayName || 'สมาชิก');
        }
        if (guild) {
            parsed = parsed.replace(/\{guild\}/g, guild.name || '');
            parsed = parsed.replace(/\{boosts\}/g, `${guild.premiumSubscriptionCount || 0}`);
            parsed = parsed.replace(/\{level\}/g, `${guild.premiumTier || 0}`);
            parsed = parsed.replace(/\{memberCount\}/g, `${guild.memberCount || 0}`);
        }
    } catch (e) {
        console.error('Tag Parsing Error:', e);
    }
    return parsed;
}

// 📌 Slash Commands Definitions
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
        .addStringOption(opt => opt.setName('category').setDescription('จำแนกประเภท').setRequired(false)
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

// 🔴 Ready Event
client.on('ready', async () => {
    console.log(`🚀 บอทพร้อมทำงาน: ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
        console.log('✅ ลงทะเบียน Slash Commands เรียบร้อย!');
    } catch (error) {
        console.error('❌ Command Registration Failed:', error);
    }
});

// 🔴 ระบบพิมพ์จุด (.) เพื่อรับยศ
client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot || !message.guild) return;

        const dotConfig = client.dotRoleConfigs.get(message.guild.id);
        if (dotConfig && message.channel.id === dotConfig.channelId) {
            const content = message.content.trim();
            if (content === '.' || content === '!') {
                const role = message.guild.roles.cache.get(dotConfig.roleId);
                if (!role) return;

                if (!message.member.roles.cache.has(role.id)) {
                    await message.member.roles.add(role).catch(() => null);
                    await message.reply({ content: `✅ คุณได้รับยศ **${role.name}** เรียบร้อยแล้ว!` }).catch(() => null);
                } else {
                    await message.reply({ content: `💡 คุณมียศ **${role.name}** อยู่แล้ว` }).catch(() => null);
                }
            }
        }
    } catch (err) {
        console.error('Message Event Error:', err);
    }
});

// 🔴 Interaction Router
client.on('interactionCreate', async (interaction) => {
    try {
        // --- 1. SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            if (interaction.commandName === 'setup-dot-role') {
                const channel = interaction.options.getChannel('channel');
                const role = interaction.options.getRole('role');
                const bannerUrl = interaction.options.getString('banner_url');
                const color = interaction.options.getString('color') || '#2ECC71';

                client.dotRoleConfigs.set(interaction.guild.id, {
                    channelId: channel.id,
                    roleId: role.id
                });

                const embed = new EmbedBuilder()
                    .setTitle('🔴 ระบบพิมพ์จุด (.) เพื่อรับยศ')
                    .setColor(color)
                    .setDescription(`พิมพ์จุด \`.\` ในช่องนี้เพื่อรับยศ <@&${role.id}> อัตโนมัติ!`)
                    .setTimestamp();

                if (bannerUrl && bannerUrl.startsWith('http')) embed.setImage(bannerUrl);

                await channel.send({ embeds: [embed] }).catch(() => null);
                return await interaction.editReply({ content: `✅ ตั้งค่าระบบพิมพ์จุดในห้อง <#${channel.id}> สำหรับยศ <@&${role.id}> เรียบร้อยแล้ว!` });
            }

            if (interaction.commandName === 'setup-shop') {
                const targetChannel = interaction.options.getChannel('channel');
                if (!targetChannel || !targetChannel.isTextBased()) {
                    return await interaction.editReply({ content: '❌ กรุณาเลือกห้องข้อความที่ถูกต้อง' });
                }

                const title = interaction.options.getString('title') || '🛒 ร้านค้าขายยศประจำเซิร์ฟเวอร์';
                const description = interaction.options.getString('description') || 'ยินดีต้อนรับคุณ {user} เลือกซื้อยศที่ต้องการ หรือกดปุ่มเติมเงินด้านล่าง!';
                const bannerUrl = interaction.options.getString('banner_url');
                const color = interaction.options.getString('color') || '#F1C40F';

                const shopEmbed = new EmbedBuilder()
                    .setTitle(title)
                    .setColor(color)
                    .setDescription(parseCustomTags(description, interaction.guild, interaction.user))
                    .setTimestamp();

                if (bannerUrl && bannerUrl.startsWith('http')) shopEmbed.setImage(bannerUrl);

                const guildItems = client.shopItems.get(interaction.guild.id) || [];
                const components = [];

                if (guildItems.length > 0) {
                    const shopSelect = new StringSelectMenuBuilder()
                        .setCustomId('select_buy_shop_role')
                        .setPlaceholder('🛒 เลือกยศที่คุณต้องการซื้อที่นี่...');

                    let validCount = 0;
                    guildItems.forEach((item) => {
                        const roleObj = interaction.guild.roles.cache.get(item.roleId);
                        if (roleObj && item.stock > 0) {
                            validCount++;
                            shopSelect.addOptions(
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(`${roleObj.name} | ${item.category}`)
                                    .setValue(item.roleId)
                                    .setDescription(`💰 ราคา: ${item.price} บาท | 📦 คงเหลือ: ${item.stock} ชิ้น`)
                            );
                        }
                    });

                    if (validCount > 0) components.push(new ActionRowBuilder().addComponents(shopSelect));
                }

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_topup_truemoney').setLabel('🧧 เติมเงิน TrueMoney').setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('btn_topup_promptpay').setLabel('📲 เติมเงิน PromptPay / QR Code').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('btn_check_balance').setLabel('💰 เช็กยอดเงินคงเหลือ').setStyle(ButtonStyle.Secondary)
                );
                components.push(btnRow);

                const sentMsg = await targetChannel.send({ embeds: [shopEmbed], components }).catch(err => {
                    console.error('Send Error:', err);
                    return null;
                });

                if (!sentMsg) {
                    return await interaction.editReply({ content: '❌ บอทไม่สามารถส่งข้อความได้ กรุณาตรวจสอบการตั้งค่า Permission ในห้องดังกล่าว' });
                }

                client.shopMessageConfigs.set(interaction.guild.id, {
                    channelId: targetChannel.id,
                    messageId: sentMsg.id,
                    title, description, bannerUrl, color
                });

                return await interaction.editReply({ content: `✅ สร้างหน้าร้านค้าในช่อง <#${targetChannel.id}> สำเร็จ!` });
            }

            if (interaction.commandName === 'add-shop-item') {
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
                return await interaction.editReply({ content: `✅ เพิ่ม/ปรับแต่งยศ **${role.name}** (ราคา ${price} บาท) ในร้านค้าสำเร็จ!` });
            }

            if (interaction.commandName === 'setup-shop-logs') {
                const topupLog = interaction.options.getChannel('topup_log');
                const shopLog = interaction.options.getChannel('shop_log');
                const accountName = interaction.options.getString('account_name') || 'ไม่ระบุชื่อบัญชี';
                const truewallet = interaction.options.getString('truewallet') || 'ไม่ระบุ';
                const promptpay = interaction.options.getString('promptpay') || 'ไม่ระบุ';
                const qrCodeUrl = interaction.options.getString('qr_code_url');

                client.shopLogsConfig.set(interaction.guild.id, {
                    topupLogId: topupLog.id, shopLogId: shopLog.id, accountName, truewallet, promptpay, qrCodeUrl
                });

                return await interaction.editReply({ content: `✅ บันทึกระบบรับเงินและตั้งค่า Log ช่องสำเร็จ!` });
            }

            if (interaction.commandName === 'setup-admin-give-money') {
                const targetChannel = interaction.options.getChannel('channel');
                const adminEmbed = new EmbedBuilder()
                    .setTitle('🪄 แผงควบคุมเสกเงิน (Admin Balance Controller)')
                    .setColor(0x9B59B6)
                    .setDescription('กดปุ่มด้านล่างเพื่อเพิ่มยอดเงินให้สมาชิก')
                    .setTimestamp();

                const btnRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_admin_give_money').setLabel('🪄 เสกเงิน / เพิ่มเครดิต').setStyle(ButtonStyle.Danger)
                );

                await targetChannel.send({ embeds: [adminEmbed], components: [btnRow] }).catch(() => null);
                return await interaction.editReply({ content: `✅ สร้างแผงควบคุมเรียบร้อยแล้ว!` });
            }
        }

        // --- 2. BUTTONS ---
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
                const modal = new ModalBuilder().setCustomId('modal_topup_truemoney').setTitle('🧧 เติมเงิน TrueMoney Wallet');
                const voucherInput = new TextInputBuilder().setCustomId('input_voucher_url').setLabel('วางลิงก์ซองของขวัญที่นี่').setStyle(TextInputStyle.Short).setRequired(true);

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

        // --- 3. SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'select_buy_shop_role') {
                await interaction.deferReply({ ephemeral: true }).catch(() => null);
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
                return await interaction.editReply({ content: `🎉 **สั่งซื้อสำเร็จ!** คุณได้รับยศ **${targetRole.name}** เรียบร้อยแล้ว` });
            }
        }

        // --- 4. MODAL SUBMITS ---
        if (interaction.isModalSubmit()) {
            await interaction.deferReply({ ephemeral: true }).catch(() => null);

            if (interaction.customId === 'modal_admin_give_money') {
                const targetUserId = interaction.fields.getTextInputValue('input_target_user_id').trim();
                const amount = parseInt(interaction.fields.getTextInputValue('input_give_amount').trim(), 10);

                if (isNaN(amount) || amount <= 0) return await interaction.editReply({ content: '❌ กรุณากรอกตัวเลขที่มากกว่า 0' });

                const newBal = (client.userBalances.get(targetUserId) || 0) + amount;
                client.userBalances.set(targetUserId, newBal);

                return await interaction.editReply({ content: `🪄 **เสกเงินสำเร็จ!** เพิ่มเงิน **${amount}** บาท ให้ผู้ใช้ <@${targetUserId}> เรียบร้อยแล้ว (รวม: **${newBal}** บาท)` });
            }

            if (interaction.customId === 'modal_topup_truemoney') {
                const voucherUrl = interaction.fields.getTextInputValue('input_voucher_url').trim();
                return await interaction.editReply({ content: `📩 **รับข้อมูลลิงก์ซองของขวัญเรียบร้อยแล้ว!**\n\`${voucherUrl}\`` });
            }
        }
    } catch (globalErr) {
        console.error('Unhandled Interaction Error:', globalErr);
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' }).catch(() => null);
        }
    }
});

client.login(TOKEN);
