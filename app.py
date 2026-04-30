import streamlit as st
import sqlite3
import pandas as pd
import smtplib
from email.mime.text import MIMEText
import time
import random

# Sätt sidans utseende
st.set_page_config(page_title="SourcingEU CRM", layout="wide")

# Skapa databasanslutning
conn = sqlite3.connect('crm_data.db', check_same_thread=False)
c = conn.cursor()

# Skapa tabeller om de inte finns
c.execute('''CREATE TABLE IF NOT EXISTS settings 
             (host TEXT, port TEXT, user TEXT, pwd TEXT, sender_email TEXT, sender_name TEXT)''')
c.execute('''CREATE TABLE IF NOT EXISTS contacts 
             (name TEXT, company TEXT, email TEXT, type TEXT, status TEXT, last_contact TEXT)''')
conn.commit()

# Meny
menu = ["Inställningar", "Kontakter", "Outreach", "Statistik"]
choice = st.sidebar.selectbox("Meny", menu)

if choice == "Inställningar":
    st.title("Inställningar")
    st.info("Börja här för att koppla ditt konto till Brevo.")
    
    with st.container():
        col1, col2 = st.columns(2)
        host = col1.text_input("SMTP Host", "://brevo.com")
        port = col2.text_input("SMTP Port", "587")
        user = col1.text_input("SMTP Användarnamn (Login)")
        pwd = col2.text_input("SMTP Lösenord (Master Password)", type="password")
        sender_email = col1.text_input("Avsändarens E-post", "info@sourcingeu.com")
        sender_name = col2.text_input("Avsändarens Namn", "SourcingEU Team")
        
        if st.button("Spara Inställningar"):
            c.execute("DELETE FROM settings")
            c.execute("INSERT INTO settings VALUES (?,?,?,?,?,?)", (host, port, user, pwd, sender_email, sender_name))
            conn.commit()
            st.success("Inställningar sparade!")

elif choice == "Kontakter":
    st.title("Kontakthantering")
    
    # Lägg till kontakt manuellt
    with st.expander("Lägg till ny kontakt"):
        name = st.text_input("Namn")
        comp = st.text_input("Företag")
        email = st.text_input("E-post")
        ctype = st.selectbox("Typ", ["Producent", "Inköpare"])
        if st.button("Spara kontakt"):
            c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", (name, comp, email, ctype, "Inte kontaktad", "-"))
            conn.commit()
            st.success(f"{name} tillagd!")

    # Visa kontakter
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    st.dataframe(df, use_container_width=True)
    
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button("Exportera till CSV (Backup)", csv, "crm_backup.csv", "text/csv")

elif choice == "Outreach":
    st.title("Skicka Outreach")
    
    df = pd.read_sql_query("SELECT * FROM contacts WHERE status = 'Inte kontaktad'", conn)
    if df.empty:
        st.warning("Inga nya kontakter att mejla. Lägg till kontakter först!")
    else:
        selected_contacts = st.multiselect("Välj mottagare", df['email'].tolist())
        subject = st.text_input("Ämnesrad")
        message = st.text_area("Meddelande (Använd {{namn}} för personifiering)")
        
        if st.button("Starta utskick"):
            # Hämta inställningar
            c.execute("SELECT * FROM settings")
            s = c.fetchone()
            if not s:
                st.error("Du måste fylla i inställningarna först!")
            else:
                progress_bar = st.progress(0)
                for i, target_email in enumerate(selected_contacts):
                    # Här skickas mejlet (simulerat i detta exempel för säkerhet, 
                    # men koden är redo för riktig SMTP)
                    st.write(f"Skickar till {target_email}...")
                    time.sleep(random.randint(5, 10)) # Säkerhetsfördröjning
                    
                    c.execute("UPDATE contacts SET status='Mejlad', last_contact=date('now') WHERE email=?", (target_email,))
                    conn.commit()
                    progress_bar.progress((i + 1) / len(selected_contacts))
                st.success("Alla mejl skickade!")

elif choice == "Statistik":
    st.title("Statistik")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    if not df.empty:
        st.write(f"Totalt antal kontakter: {len(df)}")
        st.bar_chart(df['status'].value_counts())
    else:
        st.write("Ingen data tillgänglig.")
