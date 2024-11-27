const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const { TICKET } = require('@root/config.js');
const { getSettings } = require('@schemas/Guild');
const { postToBin } = require('@helpers/HttpUtils');
const { error } = require('@helpers/Logger');

const OPEN_PERMS = ['ManageChannels'];
const CLOSE_PERMS = ['ManageChannels', 'ReadMessageHistory'];

async function handleTicketOpen(interaction) {
    await interaction.deferReply({ ephemeral: true });
    const { guild, user } = interaction;

    if (!guild.members.me.permissions.has(OPEN_PERMS))
        return interaction.followUp(
            'Cannot create ticket channel, missing `Manage Channel` permission. Contact server manager for help!'
        );

    const alreadyExists = getExistingTicketChannel(guild, user.id);
    if (alreadyExists) return interaction.followUp(`You already have an open ticket`);

    const settings = await getSettings(guild);

    // limit check
    const existing = getTicketChannels(guild).size;
    if (existing > settings.ticket.limit) return interaction.followUp('There are too many open tickets. Try again later');

    // Add new categories for the dropdown menu
    const options = [
        { label: '🤝Partnership', value: 'Partnership' },
        { label: '📢Sponsorship', value: 'Sponsorship' },
        { label: '🎫General', value: 'General' }
    ];
    const menuRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('ticket-menu')
            .setPlaceholder('Choose the ticket category')
            .addOptions(options)
    );

    await interaction.followUp({ content: 'Please choose a ticket category', components: [menuRow] });
    const res = await interaction.channel
        .awaitMessageComponent({
            componentType: ComponentType.StringSelect,
            time: 60 * 1000,
        })
        .catch((err) => {
            if (err.message.includes('time')) return;
        });

    if (!res) return interaction.editReply({ content: 'Timed out. Try again', components: [] });
    await interaction.editReply({ content: 'Processing', components: [] });
    const catName = res.values[0];

    try {
        const ticketNumber = (existing + 1).toString();
        const permissionOverwrites = [
            {
                id: guild.roles.everyone,
                deny: ['ViewChannel'],
            },
            {
                id: user.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            },
            {
                id: guild.members.me.roles.highest.id,
                allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
            },
        ];

        const tktChannel = await guild.channels.create({
            name: `tіcket-${ticketNumber}`,
            type: ChannelType.GuildText,
            topic: `tіcket|${user.id}|${catName}`,
            permissionOverwrites,
        });

        const embed = new EmbedBuilder()
            .setAuthor({ name: `Ticket #${ticketNumber}` })
            .setDescription(
                `Hello ${user.toString()}
                Support will be with you shortly
                **Category:** ${catName}
                `
            )
            .setFooter({ text: 'You may close your ticket anytime by clicking the button below' });

        const buttonsRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Close Ticket')
                .setCustomId('TICKET_CLOSE')
                .setEmoji('🔒')
                .setStyle(ButtonStyle.Primary)
        );

        const sent = await tktChannel.send({ content: user.toString(), embeds: [embed], components: [buttonsRow] });

        const dmEmbed = new EmbedBuilder()
            .setColor(TICKET.CREATE_EMBED)
            .setAuthor({ name: 'Ticket Created' })
            .setThumbnail(guild.iconURL())
            .setDescription(
                `**Server:** ${guild.name}
                **Category:** ${catName}`
            );

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('View Channel').setURL(sent.url).setStyle(ButtonStyle.Link)
        );

        user.send({ embeds: [dmEmbed], components: [row] }).catch((ex) => {});

        await interaction.editReply('Ticket created! 🔥');
    } catch (ex) {
        error('handleTicketOpen', ex);
        return interaction.editReply('Failed to create ticket channel, an error occurred!');
    }
}

module.exports = {
    getTicketChannels,
    getExistingTicketChannel,
    isTicketChannel,
    closeTicket,
    closeAllTickets,
    handleTicketOpen,
    handleTicketClose,
};
