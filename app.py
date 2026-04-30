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
    
    # --- NY SEKTION: IMPORTERA CSV ---
    with st.expander("Importera kontakter från CSV-fil"):
        uploaded_file = st.file_uploader("Välj en CSV-fil", type="csv")
        if uploaded_file is not None:
            data = pd.read_csv(uploaded_file)
            st.write("Förhandsgranskning av filen:")
            st.dataframe(data.head())
            
            # Knappar för att välja rätt kolumner
            col_name = st.selectbox("Vilken kolumn innehåller NAMN?", data.columns)
            col_email = st.selectbox("Vilken kolumn innehåller E-POST?", data.columns)
            col_comp = st.selectbox("Vilken kolumn innehåller FÖRETAG?", data.columns)
            
            if st.button("Genomför import"):
                for index, row in data.iterrows():
                    c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", 
                              (row[col_name], row[col_comp], row[col_email], "Producent", "Inte kontaktad", "-"))
                conn.commit()
                st.success(f"Importerat {len(data)} kontakter!")
                st.rerun() # Laddar om sidan så listan syns direkt

    # --- BEHÅLL MANUELL INPUT ---
    with st.expander("Lägg till ny kontakt manuellt"):
        col_m1, col_m2 = st.columns(2)
        name = col_m1.text_input("Namn")
        comp = col_m2.text_input("Företag")
        email = col_m1.text_input("E-post")
        ctype = col_m2.selectbox("Typ", ["Producent", "Inköpare"])
        if st.button("Spara manuellt"):
            c.execute("INSERT INTO contacts VALUES (?,?,?,?,?,?)", (name, comp, email, ctype, "Inte kontaktad", "-"))
            conn.commit()
            st.success(f"{name} tillagd!")
            st.rerun()

    # Visa och exportera befintliga kontakter
    st.subheader("Din kontaktlista")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    st.dataframe(df, use_container_width=True)
    
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button("Exportera/Backup till CSV", csv, "crm_backup.csv", "text/csv")


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
            c.execute("SELECT * FROM settings")
            s = c.fetchone()
            if not s:
                st.error("Du måste fylla i inställningarna först!")
            else:
                progress_bar = st.progress(0)
                try:
                    # Starta SMTP-anslutningen
                    server = smtplib.SMTP(s[0], int(s[1]))
                    server.starttls()
                    server.login(s[2], s[3])

                    for i, target_email in enumerate(selected_contacts):
                        # Hämta namnet för personifiering
                        c.execute("SELECT name FROM contacts WHERE email=?", (target_email,))
                        contact_name = c.fetchone()[0]
                        
                        # Skapa mejlet
                        personalized_message = message.replace("{{namn}}", contact_name)
                        msg = MIMEText(personalized_message)
                        msg['Subject'] = subject
                        msg['From'] = f"{s[5]} <{s[4]}>"
                        msg['To'] = target_email

                        # Skicka
                        server.sendmail(s[4], target_email, msg.as_string())
                        
                        st.write(f"✅ Skickat till {target_email}...")
                        
                        # Uppdatera databasen
                        c.execute("UPDATE contacts SET status='Mejlad', last_contact=date('now') WHERE email=?", (target_email,))
                        conn.commit()
                        
                        # Vänta mellan 10-20 sekunder (för säkerhet)
                        time.sleep(random.randint(10, 20))
                        progress_bar.progress((i + 1) / len(selected_contacts))
                    
                    server.quit()
                    st.success("Alla mejl skickade på riktigt!")
                    st.rerun()
                except Exception as e:
                    st.error(f"Ett fel uppstod: {e}")


elif choice == "Statistik":
    st.title("Statistik")
    df = pd.read_sql_query("SELECT * FROM contacts", conn)
    if not df.empty:
        st.write(f"Totalt antal kontakter: {len(df)}")
        st.bar_chart(df['status'].value_counts())
    else:
        st.write("Ingen data tillgänglig.")
