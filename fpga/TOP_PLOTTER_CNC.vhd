library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

-- TOP estructural para Spartan-6 (Xilinx ISE, VHDL-93).
-- IMPORTANTE: las salidas motor_* son 3.3 V LOGICOS hacia entradas ULN2003;
-- no conectar bobinas directamente a la FPGA.
entity TOP_PLOTTER_CNC is
  generic(CLOCK_HZ : positive := 50000000;
          BAUD : positive := 115200;
          MAX_X_STEPS : positive := 6000;
          MAX_Y_STEPS : positive := 6000;
          MAX_Z_STEPS : positive := 600;
          USE_LIMIT_SWITCHES : boolean := false);
  port(clk50MHz : in std_logic;
       reset : in std_logic;         -- reset sincrono activo alto
       uart_rx : in std_logic; uart_tx : out std_logic;
       estop_n : in std_logic;       -- emergencia activa BAJO
       limit_x_n : in std_logic; limit_y_n : in std_logic; limit_z_n : in std_logic;
       motor_x : out std_logic_vector(3 downto 0);
       motor_y : out std_logic_vector(3 downto 0);
       motor_z : out std_logic_vector(3 downto 0);
       led_busy : out std_logic; led_enabled : out std_logic);
end TOP_PLOTTER_CNC;

architecture Estructural of TOP_PLOTTER_CNC is
  signal dato_rx : std_logic_vector(7 downto 0);
  signal dato_valido, comando_valido, checksum_error : std_logic;
  signal comando, velocidad : std_logic_vector(7 downto 0);
  signal mov_x,mov_y,mov_z : signed(15 downto 0);
  signal paso_x,paso_y,paso_z,dir_x,dir_y,dir_z : std_logic;
  signal habilitar, ocupado, respuesta_valida, origen_cero, mov_valido, mov_cal_valido, paso_bloq : std_logic;
  signal respuesta_codigo : std_logic_vector(7 downto 0);
  signal estop_meta, estop_sync : std_logic := '0';
  signal lx_meta,ly_meta,lz_meta : std_logic := '1';
  signal lx_sync,ly_sync,lz_sync : std_logic := '1';
  signal limites_habilitados : std_logic;
begin
  led_busy <= ocupado;
  led_enabled <= habilitar;
  limites_habilitados <= '1' when USE_LIMIT_SWITCHES else '0';

  -- Sincronizacion de entradas asincronas a reloj de 50 MHz.
  process(clk50MHz)
  begin
    if rising_edge(clk50MHz) then
      estop_meta <= estop_n; estop_sync <= estop_meta;
      lx_meta <= limit_x_n; lx_sync <= lx_meta;
      ly_meta <= limit_y_n; ly_sync <= ly_meta;
      lz_meta <= limit_z_n; lz_sync <= lz_meta;
    end if;
  end process;

  U_C1: entity work.C1_RECEPCION_UART
    generic map(CLOCK_HZ=>CLOCK_HZ,BAUD=>BAUD)
    port map(clk=>clk50MHz,rst=>reset,rx=>uart_rx,
             data_out=>dato_rx,data_valid=>dato_valido);
  U_C2: entity work.C2_INTERPRETE_COMANDOS
    port map(clk=>clk50MHz,rst=>reset,rx_data=>dato_rx,rx_valid=>dato_valido,
             cmd_valid=>comando_valido,bad_checksum=>checksum_error,
             cmd=>comando,dx=>mov_x,dy=>mov_y,dz=>mov_z,rate=>velocidad);
  U_C3: entity work.C3_CONTROL_MOVIMIENTO_XY
    generic map(CLOCK_HZ=>CLOCK_HZ)
    port map(clk=>clk50MHz,rst=>reset,estop_n=>estop_sync,
             movimiento_valido=>mov_valido,
             movimiento_calibracion_valido=>mov_cal_valido,
             limit_x_n=>lx_sync,limit_y_n=>ly_sync,limit_z_n=>lz_sync,
             USE_LIMIT_SWITCHES=>limites_habilitados,zero_pos=>origen_cero,
             cmd_valid=>comando_valido,bad_checksum=>checksum_error,
             cmd=>comando,dx=>mov_x,dy=>mov_y,dz=>mov_z,rate=>velocidad,
             step_x=>paso_x,step_y=>paso_y,step_z=>paso_z,
             dir_x=>dir_x,dir_y=>dir_y,dir_z=>dir_z,
             motors_enabled=>habilitar,motion_busy=>ocupado,
             response_valid=>respuesta_valida,response_code=>respuesta_codigo);
  U_C4: entity work.C4_CONTROL_MOTOR_X
    port map(clk=>clk50MHz,rst=>reset,enable_coils=>habilitar,
             step_ce=>paso_x,direction=>dir_x,coils=>motor_x);
  U_C5: entity work.C5_CONTROL_MOTOR_Y
    port map(clk=>clk50MHz,rst=>reset,enable_coils=>habilitar,
             step_ce=>paso_y,direction=>dir_y,coils=>motor_y);
  U_C6: entity work.C6_CONTROL_MOTOR_Z
    port map(clk=>clk50MHz,rst=>reset,enable_coils=>habilitar,
             step_ce=>paso_z,direction=>dir_z,coils=>motor_z);
  U_C7: entity work.C7_POSICION_Y_LIMITES
    generic map(MAX_X_STEPS=>MAX_X_STEPS,MAX_Y_STEPS=>MAX_Y_STEPS,
                MAX_Z_STEPS=>MAX_Z_STEPS,USE_LIMIT_SWITCHES=>USE_LIMIT_SWITCHES)
    port map(clk=>clk50MHz,rst=>reset,zero_pos=>origen_cero,
             step_x=>paso_x,step_y=>paso_y,step_z=>paso_z,
             dir_x=>dir_x,dir_y=>dir_y,dir_z=>dir_z,
             dx=>mov_x,dy=>mov_y,dz=>mov_z,
             limit_x_n=>lx_sync,limit_y_n=>ly_sync,limit_z_n=>lz_sync,
             movimiento_valido=>mov_valido,
             movimiento_calibracion_valido=>mov_cal_valido,paso_bloqueado=>paso_bloq);
  U_C8: entity work.C8_TRANSMISION_UART
    generic map(CLOCK_HZ=>CLOCK_HZ,BAUD=>BAUD)
    port map(clk=>clk50MHz,rst=>reset,response_valid=>respuesta_valida,
             response_code=>respuesta_codigo,tx=>uart_tx,response_busy=>open);
end Estructural;