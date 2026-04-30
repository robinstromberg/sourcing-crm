import streamlit as st
import sqlite3
import pandas as pd
import smtplib
import time
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# --- DATABAS-KONFIGURATION ---
# Skapar databasen automatiskt om den inte finns
def init_db():
    conn = sqlite3.connect('sourcing_eu_crm.db')
    c = conn.cursor()
    # Tabell för inställningar (SMTP)
    c.execute('''CREATE TABLE IF NOT EXISTS settings 
                 (key TEXT PRIMARY KEY, value TEXT)''')
    # Tabell för kontakter
    c.execute('''CREATE TABLE IF NOT EXISTS contacts 
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, 
                  name TEXT, company TEXT, email TEXT UNIQUE, category TEXT)''')
    # Tabell för statistik
    c.execute('''CREATE TABLE IF NOT EXISTS stats 
                 (date TEXT, sent_count INTEGER, category TEXT)''')
    conn.commit()
    conn.close()

def get_setting(key):
    conn = sqlite3.connect('sourcing_eu_crm.db')
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key=?", (key,))
    row = c.fetchone()
    conn.close()
    return row[0] if row else ""

def save_setting(key, value):
    conn = sqlite3.connect('sourcing_eu_crm.db')
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
    conn.commit()
    conn.close()

# --- APP-LAYOUT ---
st.set_page_config(page_title="SourcingEU CRM", layout="wide")
init_db()

st.title("SourcingEU CRM & Outreach")
st.markdown("---")

# Flikar
tab1, tab2, tab3, tab4 = st.tabs(["⚙️ Inställningar", "👥 Kontakter", "📧 Outreach", "📊 Statistik"])

# --- FLIK 1: INSTÄLLNINGAR ---
with tab1:
    st.header("Konfigurera Brevo (SMTP)")
    st.info("Här ställer du in kopplingen till Brevo så att du kan skicka mejl direkt från appen.")
    
    with st.expander("📖 Guide: Hur hittar jag mina uppgifter?", expanded=True):
        st.write("""
        1. Logga in på **Brevo.com**.
        2. Klicka på ditt namn uppe till höger → **SMTP & API**.
        3. Kopiera ditt **SMTP-lösenord** (Generate a new master password om du inte har ett).
        4. Använd värdena nedan:
           - **SMTP Host:** `smtp-relay.brevo.com`
           - **Port:** `587`
        """)

    with st.form("settings_form"):
        host = st.text_input("SMTP Host", value=get_setting("smtp_host") or "smtp-relay.brevo.com")
        port = st.text_input("Port", value=get_setting("smtp_port") or "587")
        user = st.text_input("Användarnamn (Email)", value=get_setting("smtp_user"))
        pwd = st.text_input("SMTP Lösenord", value=get_setting("smtp_pass"), type="password")
        sender_name = st.text_input("Avsändarnamn (t.ex. Robin på SourcingEU)", value=get_setting("sender_name"))
        
        if st.form_submit_button("Spara Inställningar"):
            save_setting("smtp_host", host)
            save_setting("smtp_port", port)
            save_setting("smtp_user", user)
            save_setting("smtp_pass", pwd)
            save_setting("sender_name", sender_name)
            st.success("Inställningar sparade i databasen!")

# --- FLIK 2: KONTAKTER ---
with tab2:
    st.header("Hantera Kontakter")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.subheader("Ladda upp CSV")
        uploaded_file = st.file_uploader("Välj en CSV-fil", type="csv")
        if uploaded_file:
            df_upload = pd.read_csv(uploaded_file)
            st.write("Förhandsvisning:", df_upload.head(3))
            
            # Försök hitta kolumner automatiskt
            cols = df_upload.columns.tolist()
            name_col = next((c for c in cols if "namn" in c.lower() or "name" in c.lower()), cols[0])
            company_col = next((c for c in cols if "företag" in c.lower() or "company" in c.lower()), cols[1 if len(cols)>1 else 0])
            email_col = next((c for c in cols if "epost" in c.lower() or "email" in c.lower() or "e-post" in c.lower()), cols[2 if len(cols)>2 else 0])
            
            cat_choice = st.selectbox("Vilken kategori tillhör dessa?", ["Producent", "Inköpare"])
            
            if st.button("Importera kontakter"):
                conn = sqlite3.connect('sourcing_eu_crm.db')
                count = 0
                for _, row in df_upload.iterrows():
                    try:
                        conn.execute("INSERT INTO contacts (name, company, email, category) VALUES (?, ?, ?, ?)",
                                     (row[name_col], row[company_col], row[email_col], cat_choice))
                        count += 1
                    except:
                        continue
                conn.commit()
                conn.close()
                st.success(f"Importerade {count} nya kontakter!")

    with col2:
        st.subheader("Lägg till manuellt")
        with st.form("manual_contact"):
            m_name = st.text_input("Namn")
            m_comp = st.text_input("Företag")
            m_email = st.text_input("E-post")
            m_cat = st.selectbox("Kategori", ["Inköpare", "Producent"])
            if st.form_submit_button("Spara kontakt"):
                conn = sqlite3.connect('sourcing_eu_crm.db')
                try:
                    conn.execute("INSERT INTO contacts (name, company, email, category) VALUES (?, ?, ?, ?)",
                                 (m_name, m_comp, m_email, m_cat))
                    conn.commit()
                    st.success("Kontakt tillagd!")
                except:
                    st.error("E-postadressen finns redan.")
                conn.close()

    st.subheader("Alla Kontakter")
    conn = sqlite3.connect('sourcing_eu_crm.db')
    df_all = pd.read_sql_query("SELECT id, name as Namn, company as Företag, email as Epost, category as Kategori FROM contacts", conn)
    conn.close()
    
    search_q = st.text_input("Sök i databasen (Namn, Företag eller E-post)")
    if search_q:
        df_filtered = df_all[df_all.apply(lambda row: search_q.lower() in row.astype(str).str.lower().values, axis=1)]
        st.dataframe(df_filtered, use_container_width=True)
    else:
        st.dataframe(df_all, use_container_width=True)

# --- FLIK 3: OUTREACH ---
with tab3:
    st.header("Skicka Outreach")
    st.help("Här väljer du mottagare och skriver ditt personliga meddelande.")
    
    conn = sqlite3.connect('sourcing_eu_crm.db')
    contacts_list = pd.read_sql_query("SELECT id, name, email, category FROM contacts", conn)
    conn.close()
    
    if contacts_list.empty:
        st.warning("Du har inga kontakter än. Ladda upp eller lägg till några först!")
    else:
        # Flerval
        contact_options = [f"{row['name']} ({row['email']}) - {row['category']}" for _, row in contacts_list.iterrows()]
        selected_labels = st.multiselect("Välj mottagare", contact_options)
        
        # Hitta ID:n för de valda
        selected_ids = [contacts_list.iloc[contact_options.index(label)]['id'] for label in selected_labels]
        
        subj = st.text_input("Ämnesrad", placeholder="Samarbete med SourcingEU")
        msg_body = st.text_area("Meddelande", height=200, 
                                placeholder="Hej {{namn}}!\n\nJag såg ert företag och blev intresserad...")
        
        st.info("Tips: Skriv {{namn}} i texten så byts det automatiskt ut mot personens namn.")
        
        if st.button("🚀 Starta Outreach"):
            if not selected_ids:
                st.error("Välj minst en mottagare.")
            else:
                # Hämta inställningar
                s_host = get_setting("smtp_host")
                s_port = int(get_setting("smtp_port") or 587)
                s_user = get_setting("smtp_user")
                s_pass = get_setting("smtp_pass")
                s_name = get_setting("sender_name")
                
                if not s_user or not s_pass:
                    st.error("Gå till Inställningar och fyll i dina SMTP-uppgifter!")
                else:
                    progress_bar = st.progress(0)
                    status_text = st.empty()
                    
                    conn = sqlite3.connect('sourcing_eu_crm.db')
                    sent_ok = 0
                    
                    for i, cid in enumerate(selected_ids):
                        # Hämta specifik kontakt
                        c = conn.execute("SELECT name, email, category FROM contacts WHERE id=?", (int(cid),)).fetchone()
                        c_name, c_email, c_cat = c
                        
                        # Personifiera
                        personalized_msg = msg_body.replace("{{namn}}", c_name)
                        
                        try:
                            # Skicka mejl
                            msg = MIMEMultipart()
                            msg['From'] = f"{s_name} <{s_user}>"
                            msg['To'] = c_email
                            msg['Subject'] = subj
                            msg.attach(MIMEText(personalized_msg, 'plain'))
                            
                            with smtplib.SMTP(s_host, s_port) as server:
                                server.starttls()
                                server.login(s_user, s_pass)
                                server.send_message(msg)
                            
                            # Spara stats
                            conn.execute("INSERT INTO stats (date, sent_count, category) VALUES (date('now'), 1, ?)", (c_cat,))
                            sent_ok += 1
                            status_text.text(f"Skickat till {c_name} ({c_email})...")
                            
                        except Exception as e:
                            st.error(f"Kunde inte skicka till {c_email}: {e}")
                        
                        # Uppdatera progress bar
                        progress_val = (i + 1) / len(selected_ids)
                        progress_bar.progress(progress_val)
                        
                        # Vänta 30 sekunder om det inte är sista mejlet
                        if i < len(selected_ids) - 1:
                            status_text.text(f"Väntar 30 sekunder inför nästa mejl för att undvika spam-filter...")
                            time.sleep(30)
                    
                    conn.commit()
                    conn.close()
                    st.success(f"Klart! {sent_ok} mejl skickades framgångsrikt.")

# --- FLIK 4: STATISTIK ---
with tab4:
    st.header("Statistik & Resultat")
    
    conn = sqlite3.connect('sourcing_eu_crm.db')
    df_stats = pd.read_sql_query("SELECT category, SUM(sent_count) as Antal FROM stats GROUP BY category", conn)
    total_sent = pd.read_sql_query("SELECT SUM(sent_count) FROM stats", conn).iloc[0,0] or 0
    conn.close()
    
    col_s1, col_s2 = st.columns(2)
    with col_s1:
        st.metric("Totalt skickade mejl", str(total_sent))
    
    with col_s2:
        st.write("Utskick per kategori")
        if not df_stats.empty:
            st.bar_chart(df_stats.set_index('category'))
        else:
            st.info("Ingen statistik tillgänglig ännu.")

    st.markdown("---")
    st.help("Data sparas lokalt i filen 'sourcing_eu_crm.db'.")
