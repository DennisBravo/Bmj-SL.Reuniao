# ============================================================
# BMJ - Criação Automática das SharePoint Lists via PnP
# MVP: Sistema de Reserva de Salas de Reunião
# ============================================================
# Pré-requisitos:
#   Install-Module PnP.PowerShell -Scope CurrentUser
#
# Uso:
#   .\Create-SalasBMJ.ps1 -SiteUrl "https://bmj.sharepoint.com/sites/intranet"
#
# Parâmetros opcionais:
#   -PularCatalogo   → não recria o catálogo se já existir
#   -PularSeed       → não inserir as 15 salas no catálogo
#   -Verbose         → exibir detalhes de cada operação
# ============================================================

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$SiteUrl,

    [switch]$PularCatalogo,
    [switch]$PularSeed
)

# ── Cores para output ────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "  → $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

function Write-Header {
    param($msg)
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
    Write-Host "  $msg" -ForegroundColor White
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
}

# ── Helper: garantir que coluna não existe antes de criar ────
function Add-ColumnIfNotExists {
    param(
        [string]$ListName,
        [string]$FieldName,
        [scriptblock]$CreateBlock
    )
    $existing = Get-PnPField -List $ListName -Identity $FieldName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Warn "Campo '$FieldName' já existe em '$ListName' — pulando."
        return
    }
    & $CreateBlock
    Write-Ok "Campo '$FieldName' criado."
}

# ── Helper: garantir que lista não existe antes de criar ────
function New-ListIfNotExists {
    param([string]$ListName, [string]$Template = "GenericList")
    $existing = Get-PnPList -Identity $ListName -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        Write-Warn "Lista '$ListName' já existe — pulando criação."
        return $false
    }
    New-PnPList -Title $ListName -Template $Template -OnQuickLaunch | Out-Null
    Write-Ok "Lista '$ListName' criada."
    return $true
}


# ════════════════════════════════════════════════════════════
# CONEXÃO
# ════════════════════════════════════════════════════════════
Write-Header "Conectando ao SharePoint"
Write-Step "Site: $SiteUrl"

try {
    Connect-PnPOnline -Url $SiteUrl -Interactive
    Write-Ok "Conexão estabelecida."
} catch {
    Write-Fail "Falha na conexão: $_"
    exit 1
}


# ════════════════════════════════════════════════════════════
# LISTA 1: Salas_Catalogo_BMJ
# ════════════════════════════════════════════════════════════
if (-not $PularCatalogo) {
    Write-Header "Lista 1: Salas_Catalogo_BMJ"

    $catalogoCriado = New-ListIfNotExists -ListName "Salas_Catalogo_BMJ"

    # Renomear coluna Title padrão
    Write-Step "Configurando coluna Title..."
    Set-PnPField -List "Salas_Catalogo_BMJ" -Identity "Title" -Values @{
        Title        = "Nome da Sala"
        StaticName   = "Title"
        Required     = $true
    } | Out-Null
    Write-Ok "Coluna Title renomeada para 'Nome da Sala'."

    # SalaID
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "SalaID" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "ID da Sala" `
            -InternalName "SalaID" `
            -Type Number `
            -Required | Out-Null
    }

    # Capacidade
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "Capacidade" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "Capacidade (pessoas)" `
            -InternalName "Capacidade" `
            -Type Number `
            -Required | Out-Null
    }

    # Andar
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "Andar" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "Andar / Localização" `
            -InternalName "Andar" `
            -Type Text | Out-Null
    }

    # Recursos (MultiChoice)
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "Recursos" -CreateBlock {
        $recursosXml = @"
<Field Type="MultiChoice" DisplayName="Recursos" Name="Recursos" StaticName="Recursos">
  <CHOICES>
    <CHOICE>TV</CHOICE>
    <CHOICE>Videoconferência</CHOICE>
    <CHOICE>Lousa</CHOICE>
    <CHOICE>Som</CHOICE>
    <CHOICE>Transmissão</CHOICE>
  </CHOICES>
</Field>
"@
        Add-PnPFieldFromXml -List "Salas_Catalogo_BMJ" -FieldXml $recursosXml | Out-Null
    }

    # EmailSala
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "EmailSala" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "Email da Sala (Room Resource)" `
            -InternalName "EmailSala" `
            -Type Text | Out-Null
    }

    # Ativa (Boolean)
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "Ativa" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "Ativa" `
            -InternalName "Ativa" `
            -Type Boolean | Out-Null
        Set-PnPField -List "Salas_Catalogo_BMJ" -Identity "Ativa" -Values @{
            DefaultValue = "1"
        } | Out-Null
    }

    # Responsavel (Person)
    Add-ColumnIfNotExists -ListName "Salas_Catalogo_BMJ" -FieldName "Responsavel" -CreateBlock {
        Add-PnPField -List "Salas_Catalogo_BMJ" `
            -DisplayName "Responsável" `
            -InternalName "Responsavel" `
            -Type User | Out-Null
    }

    Write-Ok "Estrutura de Salas_Catalogo_BMJ concluída."
}


# ════════════════════════════════════════════════════════════
# LISTA 2: SalasReuniao_BMJ (Reservas)
# ════════════════════════════════════════════════════════════
Write-Header "Lista 2: SalasReuniao_BMJ (Reservas)"

New-ListIfNotExists -ListName "SalasReuniao_BMJ" | Out-Null

# Renomear Title
Write-Step "Configurando coluna Title..."
Set-PnPField -List "SalasReuniao_BMJ" -Identity "Title" -Values @{
    Title    = "Título da Reunião"
    Required = $true
} | Out-Null
Write-Ok "Coluna Title configurada."

# NomeSala (Choice)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "NomeSala" -CreateBlock {
    $nomeSalaXml = @"
<Field Type="Choice" DisplayName="Nome da Sala" Name="NomeSala" StaticName="NomeSala" Required="TRUE">
  <CHOICES>
    <CHOICE>Sala 01 – Ipê</CHOICE>
    <CHOICE>Sala 02 – Aroeira</CHOICE>
    <CHOICE>Sala 03 – Cedro</CHOICE>
    <CHOICE>Sala 04 – Jatobá</CHOICE>
    <CHOICE>Sala 05 – Peroba</CHOICE>
    <CHOICE>Sala 06 – Mogno</CHOICE>
    <CHOICE>Sala 07 – Angico</CHOICE>
    <CHOICE>Sala 08 – Cumaru</CHOICE>
    <CHOICE>Sala 09 – Garapeira</CHOICE>
    <CHOICE>Sala 10 – Copaíba</CHOICE>
    <CHOICE>Sala 11 – Pequi</CHOICE>
    <CHOICE>Sala 12 – Jequitibá</CHOICE>
    <CHOICE>Sala 13 – Baraúna</CHOICE>
    <CHOICE>Sala 14 – Quaresmeira</CHOICE>
    <CHOICE>Sala 15 – Sucupira</CHOICE>
  </CHOICES>
</Field>
"@
    Add-PnPFieldFromXml -List "SalasReuniao_BMJ" -FieldXml $nomeSalaXml | Out-Null
}

# SalaID
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "SalaID" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "ID da Sala" `
        -InternalName "SalaID" `
        -Type Number `
        -Required | Out-Null
}

# DataReserva
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "DataReserva" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Data da Reserva" `
        -InternalName "DataReserva" `
        -Type DateTime `
        -Required | Out-Null
    Set-PnPField -List "SalasReuniao_BMJ" -Identity "DataReserva" -Values @{
        DisplayFormat = 0  # DateOnly
    } | Out-Null
}

# HoraInicio
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "HoraInicio" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Hora de Início" `
        -InternalName "HoraInicio" `
        -Type Text `
        -Required | Out-Null
}

# HoraFim
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "HoraFim" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Hora de Fim" `
        -InternalName "HoraFim" `
        -Type Text `
        -Required | Out-Null
}

# HoraInicioMinutos  ← CRÍTICO para query de conflito
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "HoraInicioMinutos" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Início em Minutos" `
        -InternalName "HoraInicioMinutos" `
        -Type Number | Out-Null
}

# HoraFimMinutos  ← CRÍTICO para query de conflito
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "HoraFimMinutos" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Fim em Minutos" `
        -InternalName "HoraFimMinutos" `
        -Type Number | Out-Null
}

# Solicitante (Person)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "Solicitante" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Solicitante" `
        -InternalName "Solicitante" `
        -Type User `
        -Required | Out-Null
}

# SolicitanteNome (texto — cópia para exibição rápida)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "SolicitanteNome" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Nome do Solicitante" `
        -InternalName "SolicitanteNome" `
        -Type Text | Out-Null
}

# Participantes (MultiUser)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "Participantes" -CreateBlock {
    $participantesXml = @"
<Field Type="UserMulti" DisplayName="Participantes" Name="Participantes"
       StaticName="Participantes" Mult="TRUE" UserSelectionMode="PeopleAndGroups"/>
"@
    Add-PnPFieldFromXml -List "SalasReuniao_BMJ" -FieldXml $participantesXml | Out-Null
}

# ParticipantesTexto (Note — texto livre)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "ParticipantesTexto" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Participantes (texto)" `
        -InternalName "ParticipantesTexto" `
        -Type Note | Out-Null
}

# Status (Choice)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "Status" -CreateBlock {
    $statusXml = @"
<Field Type="Choice" DisplayName="Status" Name="Status" StaticName="Status"
       Required="TRUE" Default="Confirmado">
  <CHOICES>
    <CHOICE>Confirmado</CHOICE>
    <CHOICE>Cancelado</CHOICE>
    <CHOICE>Pendente</CHOICE>
    <CHOICE>Concluído</CHOICE>
  </CHOICES>
</Field>
"@
    Add-PnPFieldFromXml -List "SalasReuniao_BMJ" -FieldXml $statusXml | Out-Null
}

# Observacao
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "Observacao" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Observações" `
        -InternalName "Observacao" `
        -Type Note | Out-Null
}

# EventoOutlookID
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "EventoOutlookID" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "ID Evento Outlook" `
        -InternalName "EventoOutlookID" `
        -Type Text | Out-Null
}

# NotificacaoEnviada (Boolean)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "NotificacaoEnviada" -CreateBlock {
    Add-PnPField -List "SalasReuniao_BMJ" `
        -DisplayName "Notificação Enviada" `
        -InternalName "NotificacaoEnviada" `
        -Type Boolean | Out-Null
    Set-PnPField -List "SalasReuniao_BMJ" -Identity "NotificacaoEnviada" -Values @{
        DefaultValue = "0"
    } | Out-Null
}

# CriadoVia (Choice)
Add-ColumnIfNotExists -ListName "SalasReuniao_BMJ" -FieldName "CriadoVia" -CreateBlock {
    $criadoViaXml = @"
<Field Type="Choice" DisplayName="Criado Via" Name="CriadoVia" StaticName="CriadoVia" Default="App">
  <CHOICES>
    <CHOICE>App</CHOICE>
    <CHOICE>Nino</CHOICE>
    <CHOICE>Power Apps</CHOICE>
    <CHOICE>Manual</CHOICE>
  </CHOICES>
</Field>
"@
    Add-PnPFieldFromXml -List "SalasReuniao_BMJ" -FieldXml $criadoViaXml | Out-Null
}

Write-Ok "Todos os campos de SalasReuniao_BMJ criados."


# ════════════════════════════════════════════════════════════
# VIEWS CUSTOMIZADAS: SalasReuniao_BMJ
# ════════════════════════════════════════════════════════════
Write-Header "Configurando Views"

# View: Hoje
Write-Step "Criando view 'Hoje'..."
try {
    Add-PnPView -List "SalasReuniao_BMJ" `
        -Title "Hoje" `
        -Fields @("NomeSala","Title","HoraInicio","HoraFim","SolicitanteNome","Status") `
        -Query "<Where><And><Eq><FieldRef Name='DataReserva'/><Value Type='DateTime'><Today/></Value></Eq><Neq><FieldRef Name='Status'/><Value Type='Choice'>Cancelado</Value></Neq></And></Where><OrderBy><FieldRef Name='HoraInicioMinutos' Ascending='TRUE'/></OrderBy>" `
        -RowLimit 100 | Out-Null
    Write-Ok "View 'Hoje' criada."
} catch { Write-Warn "View 'Hoje' já existe ou erro: $_" }

# View: Por Sala
Write-Step "Criando view 'Por Sala'..."
try {
    Add-PnPView -List "SalasReuniao_BMJ" `
        -Title "Por Sala" `
        -Fields @("DataReserva","Title","HoraInicio","HoraFim","SolicitanteNome","Status") `
        -Query "<Where><Neq><FieldRef Name='Status'/><Value Type='Choice'>Cancelado</Value></Neq></Where><OrderBy><FieldRef Name='NomeSala' Ascending='TRUE'/><FieldRef Name='DataReserva' Ascending='TRUE'/><FieldRef Name='HoraInicioMinutos' Ascending='TRUE'/></OrderBy>" `
        -RowLimit 500 | Out-Null
    Write-Ok "View 'Por Sala' criada."
} catch { Write-Warn "View 'Por Sala' já existe ou erro: $_" }

# View: Todas as Reservas
Write-Step "Criando view 'Todas as Reservas'..."
try {
    Add-PnPView -List "SalasReuniao_BMJ" `
        -Title "Todas as Reservas" `
        -Fields @("NomeSala","DataReserva","Title","HoraInicio","HoraFim","SolicitanteNome","Status","CriadoVia") `
        -Query "<OrderBy><FieldRef Name='DataReserva' Ascending='FALSE'/><FieldRef Name='HoraInicioMinutos' Ascending='TRUE'/></OrderBy>" `
        -RowLimit 500 | Out-Null
    Write-Ok "View 'Todas as Reservas' criada."
} catch { Write-Warn "View 'Todas as Reservas' já existe ou erro: $_" }


# ════════════════════════════════════════════════════════════
# SEED: Inserir as 15 salas no catálogo
# ════════════════════════════════════════════════════════════
if (-not $PularSeed) {
    Write-Header "Inserindo catálogo de salas (seed)"

    $salas = @(
        @{ ID=1;  Nome="Sala 01 – Ipê";        Cap=4;  Andar="1º andar";  Recursos="TV";                              Email="sala01@bmj.com.br" },
        @{ ID=2;  Nome="Sala 02 – Aroeira";     Cap=6;  Andar="1º andar";  Recursos="TV;Videoconferência";             Email="sala02@bmj.com.br" },
        @{ ID=3;  Nome="Sala 03 – Cedro";       Cap=8;  Andar="2º andar";  Recursos="TV;Videoconferência";             Email="sala03@bmj.com.br" },
        @{ ID=4;  Nome="Sala 04 – Jatobá";      Cap=4;  Andar="2º andar";  Recursos="TV";                              Email="sala04@bmj.com.br" },
        @{ ID=5;  Nome="Sala 05 – Peroba";      Cap=10; Andar="2º andar";  Recursos="TV;Videoconferência;Lousa";       Email="sala05@bmj.com.br" },
        @{ ID=6;  Nome="Sala 06 – Mogno";       Cap=6;  Andar="3º andar";  Recursos="TV";                              Email="sala06@bmj.com.br" },
        @{ ID=7;  Nome="Sala 07 – Angico";      Cap=12; Andar="3º andar";  Recursos="TV;Videoconferência";             Email="sala07@bmj.com.br" },
        @{ ID=8;  Nome="Sala 08 – Cumaru";      Cap=4;  Andar="3º andar";  Recursos="TV";                              Email="sala08@bmj.com.br" },
        @{ ID=9;  Nome="Sala 09 – Garapeira";   Cap=8;  Andar="4º andar";  Recursos="TV;Videoconferência";             Email="sala09@bmj.com.br" },
        @{ ID=10; Nome="Sala 10 – Copaíba";     Cap=6;  Andar="4º andar";  Recursos="TV";                              Email="sala10@bmj.com.br" },
        @{ ID=11; Nome="Sala 11 – Pequi";       Cap=20; Andar="4º andar";  Recursos="TV;Videoconferência;Lousa;Som";   Email="sala11@bmj.com.br" },
        @{ ID=12; Nome="Sala 12 – Jequitibá";   Cap=4;  Andar="5º andar";  Recursos="TV";                              Email="sala12@bmj.com.br" },
        @{ ID=13; Nome="Sala 13 – Baraúna";     Cap=6;  Andar="5º andar";  Recursos="TV;Videoconferência";             Email="sala13@bmj.com.br" },
        @{ ID=14; Nome="Sala 14 – Quaresmeira"; Cap=8;  Andar="5º andar";  Recursos="TV";                              Email="sala14@bmj.com.br" },
        @{ ID=15; Nome="Sala 15 – Sucupira";    Cap=30; Andar="Térreo";    Recursos="TV;Videoconferência;Lousa;Som";   Email="sala15@bmj.com.br" }
    )

    foreach ($sala in $salas) {
        # Verificar se já existe pelo SalaID
        $existe = Get-PnPListItem -List "Salas_Catalogo_BMJ" `
            -Query "<View><Query><Where><Eq><FieldRef Name='SalaID'/><Value Type='Number'>$($sala.ID)</Value></Eq></Where></Query></View>"

        if ($existe) {
            Write-Warn "Sala ID $($sala.ID) ($($sala.Nome)) já existe — pulando."
            continue
        }

        Add-PnPListItem -List "Salas_Catalogo_BMJ" -Values @{
            Title      = $sala.Nome
            SalaID     = $sala.ID
            Capacidade = $sala.Cap
            Andar      = $sala.Andar
            Recursos   = $sala.Recursos
            EmailSala  = $sala.Email
            Ativa      = $true
        } | Out-Null

        Write-Ok "[$($sala.ID)/15] $($sala.Nome) inserida."
    }

    Write-Ok "Seed concluído — 15 salas no catálogo."
}


# ════════════════════════════════════════════════════════════
# PERMISSÕES: quebrar herança e ajustar
# ════════════════════════════════════════════════════════════
Write-Header "Configurando Permissões"

Write-Step "SalasReuniao_BMJ — todos os colaboradores podem contribuir..."
try {
    # Quebra herança mantendo permissões atuais
    Set-PnPList -Identity "SalasReuniao_BMJ" -BreakRoleInheritance $true -CopyRoleAssignments $true | Out-Null

    # Garante que "Todos exceto usuários externos" tenham permissão de Contribute
    $group = "c:0(.s|true"  # claim de todos os usuários autenticados
    Set-PnPListPermission -Identity "SalasReuniao_BMJ" -User $group -AddRole "Contribute" -ErrorAction SilentlyContinue

    Write-Ok "Permissões configuradas."
} catch {
    Write-Warn "Não foi possível configurar permissões automaticamente: $_"
    Write-Warn "Configure manualmente: Lista → Configurações → Permissões"
}

Write-Step "Salas_Catalogo_BMJ — somente administradores editam, todos lêem..."
try {
    Set-PnPList -Identity "Salas_Catalogo_BMJ" -BreakRoleInheritance $true -CopyRoleAssignments $true | Out-Null
    Write-Ok "Herança quebrada — ajuste permissões de edição manualmente se necessário."
} catch {
    Write-Warn "Erro ao configurar permissões do catálogo: $_"
}


# ════════════════════════════════════════════════════════════
# RELATÓRIO FINAL
# ════════════════════════════════════════════════════════════
Write-Header "Relatório Final"

$reservasList  = Get-PnPList -Identity "SalasReuniao_BMJ"  -ErrorAction SilentlyContinue
$catalogoList  = Get-PnPList -Identity "Salas_Catalogo_BMJ" -ErrorAction SilentlyContinue
$totalSalas    = (Get-PnPListItem -List "Salas_Catalogo_BMJ" -ErrorAction SilentlyContinue).Count

Write-Host ""
Write-Host "  Lista                  Status       Items" -ForegroundColor DarkGray
Write-Host "  ─────────────────────────────────────────" -ForegroundColor DarkGray

if ($reservasList)  { Write-Host "  SalasReuniao_BMJ       " -NoNewline; Write-Host "✓ OK          " -ForegroundColor Green -NoNewline; Write-Host "0 reservas" }
else                { Write-Host "  SalasReuniao_BMJ       " -NoNewline; Write-Host "✗ NÃO CRIADA" -ForegroundColor Red }

if ($catalogoList)  { Write-Host "  Salas_Catalogo_BMJ     " -NoNewline; Write-Host "✓ OK          " -ForegroundColor Green -NoNewline; Write-Host "$totalSalas salas" }
else                { Write-Host "  Salas_Catalogo_BMJ     " -NoNewline; Write-Host "✗ NÃO CRIADA" -ForegroundColor Red }

Write-Host ""
Write-Host "  Site: $SiteUrl" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Próximos passos:" -ForegroundColor White
Write-Host "    1. Criar os fluxos no Power Automate (power-automate-flows.yaml)" -ForegroundColor Gray
Write-Host "    2. Copiar as URLs HTTP dos triggers para o .env do Nino" -ForegroundColor Gray
Write-Host "    3. Criar Room Resources no Exchange Admin para cada sala" -ForegroundColor Gray
Write-Host "    4. Atualizar coluna EmailSala no catálogo com os emails reais" -ForegroundColor Gray
Write-Host ""
Write-Host "  Documentação PnP: https://pnp.github.io/powershell" -ForegroundColor DarkGray
Write-Host ""

Disconnect-PnPOnline
Write-Ok "Concluído. Conexão encerrada."
