import streamlit as st
import sqlite3
import pandas as pd
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
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
    st.info("Fyll i dina uppgifter nedan och tryck på Spara.")
    
    with st.container():
        col1, col2 = st.columns(2)
        
        host = col1.text_input("SMTP Host", "://brevo.com")
        port = col2.text_input("SMTP Port", "587")
        
        # ÄNDRA DESSA TVÅ RADER NEDAN:
        user = col1.text_input("SMTP Användarnamn (Login)", "DIN_MEJL_HÄR@DOMÄN.COM")
        pwd = col2.text_input("SMTP Lösenord (Master Password)", "DIN_NYCKEL_HÄR", type="password")
        
        sender_email = col1.text_input("Avsändarens E-post", "info@sourcingeu.com")
        sender_name = col2.text_input("Avsändarens Namn", "SourcingEU Team")
        
        if st.button("Spara Inställningar"):
            c.execute("DELETE FROM settings")
            c.execute("INSERT INTO settings VALUES (?,?,?,?,?,?)", (host, port, user, pwd, sender_email, sender_name))
            conn.commit()
            st.success("Inställningar sparade!")

elif choice == "Kontakter":
    st.title("Kontakthantering")
    
    with st.expander("Importera kontakter från CSV-fil"):
        uploaded_file = st.file_uploader("Välj en CSV-fil", type="csv")
        if uploaded_file is not None:
            data = pd.read_csv(uploaded_file)
            st.write("Förhandsgranskning:")
            st.dataframe(data.head(3))
            
            col_name = st.selectbox("Kolumn för NAMN", data.columns)
            col_email = st.selectbox("Kolumn för E-POST", data.columns)
            col_comp = st.selectbox("Kolumn för FÖRETAG", data.columns)
            
            if st.button("Genomför import"):
                for index, row in data.iterrows():
                    c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", 
                              (str(row[col_name]), str(row[col_comp]), str(row[col_email]), "Producent", "Inte kontaktad", "-"))
                conn.commit()
                st.success("Importerat!")
                st.rerun()

    with st.expander("Lägg till ny kontakt manuellt"):
        col_m1, col_m2 = st.columns(2)
        name = st.text_input("Namn")
        comp = st.text_input("Företag")
        email = st.text_input("E-post")
        ctype = st.selectbox("Typ", ["Producent", "Inköpare"])
        if st.button("Spara manuellt"):
            c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", (name, comp, email, ctype, "Inte kontaktad", "-"))
            conn.commit()
            st.success(f"{name} tillagd!")
            st.rerun()

    st.subheader("Din kontaktlista")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    st.dataframe(df, use_container_width=True)
    
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button("Exportera/Backup till CSV", csv, "crm_backup.csv", "text/csv")

elif choice == "Outreach":
    st.title("Skicka Outreach")
    
    df = pd.read_sql_query("SELECT * FROM contacts WHERE status = 'Inte kontaktad'", conn)
    if df.empty:
        st.warning("Inga nya kontakter att mejla.")
        if st.button("Nollställ alla till 'Inte kontaktad'"):
            c.execute("UPDATE contacts SET status='Inte kontaktad'")
            conn.commit()
            st.rerun()
    else:
        selected_emails = st.multiselect("Välj mottagare", df['email'].tolist())
        subject = st.text_input("Ämnesrad")
        message_body = st.text_area("Meddelande (Använd {{namn}} för personifiering)")
        
        if st.button("Starta utskick"):
            c.execute("SELECT * FROM settings")
            s = c.fetchone()
            if not s:
                st.error("Fyll i inställningarna först!")
            else:
                try:
                    server = smtplib.SMTP(s[0], int(s[1]))
                    server.starttls()
                    server.login(s[2], s[3])
                    
                    progress_bar = st.progress(0)
                    for i, target_email in enumerate(selected_emails):
                        c.execute("SELECT name FROM contacts WHERE email=?", (target_email,))
                        contact_name = c.fetchone()[0]
                        
                        final_msg = message_body.replace("{{namn}}", str(contact_name))
                        
                        msg = MIMEMultipart()
                        msg['From'] = f"{s[5]} <{s[4]}>"
                        msg['To'] = target_email
                        msg['Subject'] = subject
                        msg.attach(MIMEText(final_msg, 'plain'))

                        server.sendmail(s[4], target_email, msg.as_string())
                        
                        c.execute("UPDATE contacts SET status='Mejlad', last_contact=date('now') WHERE email=?", (target_email,))
                        conn.commit()
                        
                        st.write(f"✅ Skickat till {target_email}")
                        time.sleep(random.randint(5, 10))
                        progress_bar.progress((i + 1) / len(selected_emails))
                    
                    server.quit()
                    st.success("Klart!")
                    st.rerun()
                except Exception as e:
                    st.error(f"Fel: {e}")

elif choice == "Statistik":
    st.title("Statistik")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    if not df.empty:
        st.write(f"Totalt: {len(df)}")
        st.bar_chart(df['status'].value_counts())
